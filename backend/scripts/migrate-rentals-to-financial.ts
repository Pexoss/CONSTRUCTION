import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { Rental } from "../src/modules/rentals/rental.model";
import { Billing } from "../src/modules/billings/billing.model";
import { Charge } from "../src/modules/charges/charge.model";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const MIGRATION_TAG = "[migration-financial-v1]";
const MIGRATION_USER_ID = new mongoose.Types.ObjectId("000000000000000000000000");
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MIGRATION_TAG_REGEX = new RegExp(escapeRegex(MIGRATION_TAG));

const args = new Set(process.argv.slice(2));
const getArg = (name: string) =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];

const isDryRun = args.has("--dry-run");
const createCharges = args.has("--create-charges");
const force = args.has("--force");
const batchSize = parseInt(getArg("batch") || "100", 10);
const limit = parseInt(getArg("limit") || "0", 10);
const companyFilter = getArg("company");
const cutoff = getArg("cutoff") ? new Date(getArg("cutoff") as string) : new Date();

const log = (message: string) => console.log(message);

const toDate = (value?: Date | string | null): Date | undefined => {
  if (!value) return undefined;
  return value instanceof Date ? value : new Date(value);
};

const getRentalType = (rental: any): "daily" | "weekly" | "biweekly" | "monthly" => {
  return rental.dates?.billingCycle || rental.items?.[0]?.rentalType || "daily";
};

const getPeriodBounds = (rental: any, now: Date) => {
  const pickup = toDate(rental.dates?.pickupActual) || toDate(rental.dates?.pickupScheduled);
  const returnActual = toDate(rental.dates?.returnActual);
  const returnScheduled = toDate(rental.dates?.returnScheduled);

  if (!pickup) return null;

  const periodStart = pickup;
  const periodEndBase = returnActual || returnScheduled || now;
  const periodEnd = periodEndBase > now ? now : periodEndBase;

  if (periodEnd < periodStart) return null;
  return { periodStart, periodEnd };
};

const buildBillingPayload = (rental: any, periodStart: Date, periodEnd: Date) => {
  const rentalType = getRentalType(rental);
  const items = (rental.items || []).map((item: any) => ({
    itemId: item.itemId,
    unitId: item.unitId,
    quantity: item.quantity || 1,
    unitPrice: item.unitPrice || 0,
    periodsCharged: 1,
    subtotal: Number(item.subtotal || (item.unitPrice || 0) * (item.quantity || 1)),
  }));

  const services = (rental.services || []).map((service: any) => ({
    description: service.description,
    price: Number(service.price || 0),
    quantity: Number(service.quantity || 1),
    subtotal: Number(service.subtotal || (service.price || 0) * (service.quantity || 1)),
  }));

  const baseAmount = Number(
    items.reduce((acc: number, item: any) => acc + Number(item.subtotal || 0), 0).toFixed(2),
  );
  const servicesAmount = Number(
    services.reduce((acc: number, service: any) => acc + Number(service.subtotal || 0), 0).toFixed(2),
  );
  const subtotal = Number((baseAmount + servicesAmount).toFixed(2));
  const discount = Number(rental.pricing?.discount || 0);
  const total =
    Number(rental.pricing?.total) > 0
      ? Number(rental.pricing.total)
      : Number((subtotal - discount + Number(rental.pricing?.lateFee || 0)).toFixed(2));

  return {
    companyId: rental.companyId,
    rentalId: rental._id,
    customerId: rental.customerId,
    billingDate: new Date(),
    periodStart,
    periodEnd,
    rentalType,
    calculation: {
      baseRate: Number(items[0]?.unitPrice || 0),
      periodsCompleted: 1,
      extraDays: 0,
      chargeExtraPeriod: false,
      baseAmount,
      servicesAmount,
      subtotal,
      discount,
      discountReason: rental.pricing?.discountReason,
      total,
    },
    items,
    services,
    status: "approved",
    financialStage: "pending",
    governance: "charge",
    outstandingAmount: total,
    approvalRequired: false,
    requestedBy: rental.createdBy || MIGRATION_USER_ID,
    notes: `${MIGRATION_TAG} Migração automática do aluguel ${rental.rentalNumber || rental._id}`,
  };
};

const createChargesFromPendingBillings = async (companyId?: string) => {
  const billingFilter: any = {
    status: "approved",
    chargeId: { $exists: false },
    invoiceId: { $exists: false },
    notes: { $regex: MIGRATION_TAG_REGEX },
  };
  if (companyId) billingFilter.companyId = new mongoose.Types.ObjectId(companyId);

  const pendingBillings = await Billing.find(billingFilter).sort({ customerId: 1, billingDate: 1 });
  const groups = new Map<string, any[]>();

  for (const billing of pendingBillings) {
    const key = `${billing.companyId.toString()}:${billing.customerId.toString()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(billing);
  }

  let created = 0;
  for (const [key, group] of groups.entries()) {
    const [company, customer] = key.split(":");
    const total = group.reduce((acc, item) => acc + Number(item.outstandingAmount || item.calculation.total || 0), 0);
    if (total <= 0) continue;

    if (!isDryRun) {
      const charge = await Charge.create({
        companyId: new mongoose.Types.ObjectId(company),
        customerId: new mongoose.Types.ObjectId(customer),
        billingIds: group.map((billing) => billing._id),
        total: Number(total.toFixed(2)),
        paidAmount: 0,
        outstandingAmount: Number(total.toFixed(2)),
        status: "pending",
        notes: `${MIGRATION_TAG} Cobrança criada automaticamente`,
        createdBy: MIGRATION_USER_ID,
      });

      await Billing.updateMany(
        { _id: { $in: group.map((billing) => billing._id) } },
        { $set: { chargeId: charge._id, financialStage: "charge", governance: "charge" } },
      );
    }
    created += 1;
  }

  return created;
};

const run = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required");

  await mongoose.connect(uri);
  log(`Connected to MongoDB`);
  log(`Mode: ${isDryRun ? "DRY RUN" : "EXECUTION"}`);

  const rentalFilter: any = {
    status: { $in: ["active", "overdue", "ready_to_close", "completed"] },
  };
  if (companyFilter) rentalFilter.companyId = new mongoose.Types.ObjectId(companyFilter);

  const cursor = Rental.find(rentalFilter).limit(limit > 0 ? limit : 0).cursor();

  let processed = 0;
  let createdBillings = 0;
  let skippedExisting = 0;
  let skippedNoPeriod = 0;

  for await (const rental of cursor) {
    processed += 1;

    const existingCount = await Billing.countDocuments({
      companyId: rental.companyId,
      rentalId: rental._id,
      notes: { $regex: MIGRATION_TAG_REGEX },
    });
    if (existingCount > 0 && !force) {
      skippedExisting += 1;
      continue;
    }

    const bounds = getPeriodBounds(rental, cutoff);
    if (!bounds) {
      skippedNoPeriod += 1;
      continue;
    }

    const payload = buildBillingPayload(rental, bounds.periodStart, bounds.periodEnd);
    if (!isDryRun) {
      await Billing.create(payload);
    }
    createdBillings += 1;

    if (processed % batchSize === 0) {
      log(`Processed ${processed} rentals | created billings: ${createdBillings}`);
    }
  }

  let createdCharges = 0;
  if (createCharges) {
    createdCharges = await createChargesFromPendingBillings(companyFilter);
  }

  log("Migration finished.");
  log(`Processed rentals: ${processed}`);
  log(`Created billings: ${createdBillings}`);
  log(`Skipped (already migrated): ${skippedExisting}`);
  log(`Skipped (invalid period): ${skippedNoPeriod}`);
  log(`Created charges: ${createdCharges}`);

  await mongoose.disconnect();
};

run().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});

