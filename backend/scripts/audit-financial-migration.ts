import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { Rental } from "../src/modules/rentals/rental.model";
import { Billing } from "../src/modules/billings/billing.model";
import { Charge } from "../src/modules/charges/charge.model";
import { Invoice } from "../src/modules/invoices/invoice.model";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const MIGRATION_TAG = "[migration-financial-v1]";
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MIGRATION_TAG_REGEX = new RegExp(escapeRegex(MIGRATION_TAG));
const getArg = (name: string) =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];

const companyFilter = getArg("company");

const run = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required");

  await mongoose.connect(uri);

  const rentalScope: any = {
    status: { $in: ["active", "overdue", "ready_to_close", "completed"] },
  };
  const financialScope: any = {};
  if (companyFilter) {
    const companyId = new mongoose.Types.ObjectId(companyFilter);
    rentalScope.companyId = companyId;
    financialScope.companyId = companyId;
  }

  const [rentalsTotal, billingsMigrated, chargesMigrated, invoicesTotal] = await Promise.all([
    Rental.countDocuments(rentalScope),
    Billing.countDocuments({ ...financialScope, notes: { $regex: MIGRATION_TAG_REGEX } }),
    Charge.countDocuments({ ...financialScope, notes: { $regex: MIGRATION_TAG_REGEX } }),
    Invoice.countDocuments(financialScope),
  ]);

  const rentalsWithoutMigratedBilling = await Rental.aggregate([
    { $match: rentalScope },
    {
      $lookup: {
        from: "billings",
        let: { rentalId: "$_id", companyId: "$companyId" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [{ $eq: ["$rentalId", "$$rentalId"] }, { $eq: ["$companyId", "$$companyId"] }],
              },
            },
          },
          { $match: { notes: { $regex: MIGRATION_TAG_REGEX } } },
        ],
        as: "migratedBillings",
      },
    },
    { $match: { migratedBillings: { $size: 0 } } },
    { $count: "total" },
  ]);

  const orphanBillings = await Billing.countDocuments({
    ...financialScope,
    notes: { $regex: MIGRATION_TAG_REGEX },
    chargeId: { $exists: false },
    invoiceId: { $exists: false },
    status: { $nin: ["paid", "cancelled"] },
  });

  console.log("=== AUDIT FINANCIAL MIGRATION ===");
  console.log(`Rentals elegíveis: ${rentalsTotal}`);
  console.log(`Billings migrados: ${billingsMigrated}`);
  console.log(`Charges migradas: ${chargesMigrated}`);
  console.log(`Invoices existentes: ${invoicesTotal}`);
  console.log(
    `Rentals sem billing migrado: ${Number(rentalsWithoutMigratedBilling[0]?.total || 0)}`,
  );
  console.log(`Billings migrados sem charge/fatura: ${orphanBillings}`);
  console.log("================================");

  await mongoose.disconnect();
};

run().catch((error) => {
  console.error("Audit failed:", error);
  process.exit(1);
});

