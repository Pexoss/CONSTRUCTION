import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { Billing } from "../src/modules/billings/billing.model";
import { Charge } from "../src/modules/charges/charge.model";
import { Customer } from "../src/modules/customers/customer.model";
import { Invoice } from "../src/modules/invoices/invoice.model";
import { Item } from "../src/modules/inventory/item.model";
import { Rental } from "../src/modules/rentals/rental.model";
import { isValidCpfCnpj } from "../src/shared/utils/document.utils";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const getArg = (name: string) =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];

const companyFilter = getArg("company");
const sampleLimit = Math.max(1, parseInt(getArg("samples") || "5", 10));

const moneyTolerance = 0.01;

const normalizeDocument = (value?: string | null) =>
  String(value || "").replace(/\D/g, "");

const scoped = (extra: Record<string, any> = {}) => {
  if (!companyFilter) return extra;
  return {
    ...extra,
    companyId: new mongoose.Types.ObjectId(companyFilter),
  };
};

const ids = (docs: any[]) => docs.map((doc) => String(doc._id));

const printSection = (title: string) => {
  console.log("");
  console.log(`=== ${title} ===`);
};

const printCount = async (
  title: string,
  countPromise: Promise<number>,
  samplePromise?: Promise<any[]>,
) => {
  const count = await countPromise;
  console.log(`${title}: ${count}`);
  if (samplePromise && count > 0) {
    const samples = await samplePromise;
    console.log(`  exemplos: ${ids(samples).join(", ") || "nenhum"}`);
  }
};

const auditBillings = async () => {
  printSection("Billings");

  await printCount(
    "Pagos com saldo aberto",
    Billing.countDocuments(scoped({ status: "paid", outstandingAmount: { $gt: moneyTolerance } })),
    Billing.find(scoped({ status: "paid", outstandingAmount: { $gt: moneyTolerance } }))
      .select("_id billingNumber outstandingAmount status")
      .limit(sampleLimit)
      .lean(),
  );

  await printCount(
    "Nao pagos com saldo zerado",
    Billing.countDocuments(
      scoped({
        status: { $nin: ["paid", "cancelled"] },
        outstandingAmount: { $lte: moneyTolerance },
      }),
    ),
    Billing.find(
      scoped({
        status: { $nin: ["paid", "cancelled"] },
        outstandingAmount: { $lte: moneyTolerance },
      }),
    )
      .select("_id billingNumber outstandingAmount status")
      .limit(sampleLimit)
      .lean(),
  );

  await printCount(
    "Com charge e invoice simultaneamente",
    Billing.countDocuments(
      scoped({
        chargeId: { $exists: true, $ne: null },
        invoiceId: { $exists: true, $ne: null },
      }),
    ),
    Billing.find(
      scoped({
        chargeId: { $exists: true, $ne: null },
        invoiceId: { $exists: true, $ne: null },
      }),
    )
      .select("_id billingNumber chargeId invoiceId")
      .limit(sampleLimit)
      .lean(),
  );

  const chargeMismatch = await Charge.aggregate([
    { $match: scoped({ status: { $ne: "cancelled" } }) },
    {
      $lookup: {
        from: "billings",
        localField: "billingIds",
        foreignField: "_id",
        as: "billings",
      },
    },
    {
      $addFields: {
        expectedOpenFromBillings: {
          $sum: {
            $map: {
              input: "$billings",
              as: "billing",
              in: { $ifNull: ["$$billing.outstandingAmount", "$$billing.calculation.total"] },
            },
          },
        },
      },
    },
    {
      $match: {
        $expr: {
          $gt: [
            { $abs: { $subtract: ["$outstandingAmount", "$expectedOpenFromBillings"] } },
            moneyTolerance,
          ],
        },
      },
    },
    { $limit: sampleLimit },
    { $project: { _id: 1, chargeNumber: 1, outstandingAmount: 1, expectedOpenFromBillings: 1 } },
  ]);
  console.log(`Saldo aberto diferente da soma dos fechamentos vinculados: ${chargeMismatch.length}`);
  if (chargeMismatch.length) {
    console.log(`  exemplos: ${ids(chargeMismatch).join(", ")}`);
  }
};

const auditCharges = async () => {
  printSection("Charges");

  const inconsistent = await Charge.aggregate([
    { $match: scoped() },
    {
      $addFields: {
        expectedTotal: { $add: ["$paidAmount", "$outstandingAmount"] },
      },
    },
    {
      $match: {
        $expr: {
          $gt: [{ $abs: { $subtract: ["$total", "$expectedTotal"] } }, moneyTolerance],
        },
      },
    },
    { $limit: sampleLimit },
    { $project: { _id: 1, chargeNumber: 1, total: 1, paidAmount: 1, outstandingAmount: 1 } },
  ]);

  const inconsistentCount = await Charge.aggregate([
    { $match: scoped() },
    {
      $addFields: {
        expectedTotal: { $add: ["$paidAmount", "$outstandingAmount"] },
      },
    },
    {
      $match: {
        $expr: {
          $gt: [{ $abs: { $subtract: ["$total", "$expectedTotal"] } }, moneyTolerance],
        },
      },
    },
    { $count: "total" },
  ]);

  console.log(`Total diferente de pago + saldo: ${Number(inconsistentCount[0]?.total || 0)}`);
  if (inconsistent.length) {
    console.log(`  exemplos: ${ids(inconsistent).join(", ")}`);
  }

  await printCount(
    "Pagas com saldo aberto",
    Charge.countDocuments(scoped({ status: "paid", outstandingAmount: { $gt: moneyTolerance } })),
    Charge.find(scoped({ status: "paid", outstandingAmount: { $gt: moneyTolerance } }))
      .select("_id chargeNumber outstandingAmount status")
      .limit(sampleLimit)
      .lean(),
  );
};

const auditInventory = async () => {
  printSection("Inventory");

  await printCount(
    "Itens quantitativos sem quantity.reserved",
    Item.countDocuments(scoped({ trackingType: "quantity", "quantity.reserved": { $exists: false } })),
    Item.find(scoped({ trackingType: "quantity", "quantity.reserved": { $exists: false } }))
      .select("_id name sku quantity")
      .limit(sampleLimit)
      .lean(),
  );

  const inconsistent = await Item.aggregate([
    { $match: scoped({ trackingType: "quantity" }) },
    {
      $addFields: {
        quantitySum: {
          $add: [
            { $ifNull: ["$quantity.available", 0] },
            { $ifNull: ["$quantity.reserved", 0] },
            { $ifNull: ["$quantity.rented", 0] },
            { $ifNull: ["$quantity.maintenance", 0] },
            { $ifNull: ["$quantity.damaged", 0] },
          ],
        },
      },
    },
    {
      $match: {
        $expr: {
          $ne: ["$quantity.total", "$quantitySum"],
        },
      },
    },
    { $limit: sampleLimit },
    { $project: { _id: 1, name: 1, sku: 1, quantity: 1, quantitySum: 1 } },
  ]);

  const inconsistentCount = await Item.aggregate([
    { $match: scoped({ trackingType: "quantity" }) },
    {
      $addFields: {
        quantitySum: {
          $add: [
            { $ifNull: ["$quantity.available", 0] },
            { $ifNull: ["$quantity.reserved", 0] },
            { $ifNull: ["$quantity.rented", 0] },
            { $ifNull: ["$quantity.maintenance", 0] },
            { $ifNull: ["$quantity.damaged", 0] },
          ],
        },
      },
    },
    {
      $match: {
        $expr: {
          $ne: ["$quantity.total", "$quantitySum"],
        },
      },
    },
    { $count: "total" },
  ]);

  console.log(`Soma operacional diferente do total: ${Number(inconsistentCount[0]?.total || 0)}`);
  if (inconsistent.length) {
    console.log(`  exemplos: ${ids(inconsistent).join(", ")}`);
  }
};

const auditRentals = async () => {
  printSection("Rentals");

  await printCount(
    "Em ready_to_close",
    Rental.countDocuments(scoped({ status: "ready_to_close" })),
    Rental.find(scoped({ status: "ready_to_close" }))
      .select("_id rentalNumber status dates.returnActual")
      .limit(sampleLimit)
      .lean(),
  );

  await printCount(
    "Sem fulfillmentMethod",
    Rental.countDocuments(scoped({ fulfillmentMethod: { $exists: false } })),
    Rental.find(scoped({ fulfillmentMethod: { $exists: false } }))
      .select("_id rentalNumber status")
      .limit(sampleLimit)
      .lean(),
  );

  const totalFormulaMismatch = await Rental.aggregate([
    { $match: scoped({ status: { $ne: "cancelled" } }) },
    {
      $addFields: {
        expectedRentalTotal: {
          $max: [
            0,
            {
              $subtract: [
                { $add: [{ $ifNull: ["$pricing.equipmentSubtotal", 0] }, { $ifNull: ["$pricing.servicesSubtotal", 0] }, { $ifNull: ["$pricing.lateFee", 0] }] },
                { $ifNull: ["$pricing.discount", 0] },
              ],
            },
          ],
        },
      },
    },
    {
      $match: {
        $expr: {
          $gt: [{ $abs: { $subtract: ["$pricing.total", "$expectedRentalTotal"] } }, moneyTolerance],
        },
      },
    },
    { $limit: sampleLimit },
    { $project: { _id: 1, rentalNumber: 1, "pricing.total": 1, expectedRentalTotal: 1 } },
  ]);
  console.log(`Total de aluguel divergente da formula esperada (equip+servicos+multa-desconto): ${totalFormulaMismatch.length}`);
  if (totalFormulaMismatch.length) {
    console.log(`  exemplos: ${ids(totalFormulaMismatch).join(", ")}`);
  }
};

const auditInvoices = async () => {
  printSection("Invoices");

  await printCount(
    "Pagas sem paidDate",
    Invoice.countDocuments(scoped({ status: "paid", paidDate: { $exists: false } })),
    Invoice.find(scoped({ status: "paid", paidDate: { $exists: false } }))
      .select("_id invoiceNumber status total")
      .limit(sampleLimit)
      .lean(),
  );

  const invoiceMismatch = await Invoice.aggregate([
    { $match: scoped({ status: { $ne: "cancelled" }, billingIds: { $exists: true, $ne: [] } }) },
    {
      $lookup: {
        from: "billings",
        localField: "billingIds",
        foreignField: "_id",
        as: "billings",
      },
    },
    {
      $addFields: {
        expectedFromBillings: {
          $sum: {
            $map: {
              input: "$billings",
              as: "billing",
              in: { $ifNull: ["$$billing.outstandingAmount", "$$billing.calculation.total"] },
            },
          },
        },
      },
    },
    {
      $match: {
        $expr: {
          $gt: [{ $abs: { $subtract: ["$total", "$expectedFromBillings"] } }, moneyTolerance],
        },
      },
    },
    { $limit: sampleLimit },
    { $project: { _id: 1, invoiceNumber: 1, total: 1, expectedFromBillings: 1 } },
  ]);
  console.log(`Faturas com total diferente dos saldos dos fechamentos vinculados: ${invoiceMismatch.length}`);
  if (invoiceMismatch.length) {
    console.log(`  exemplos: ${ids(invoiceMismatch).join(", ")}`);
  }
};

const auditCustomers = async () => {
  printSection("Customers");

  const customers = await Customer.find(scoped({ cpfCnpj: { $exists: true, $nin: [null, ""] } }))
    .select("_id companyId name cpfCnpj")
    .lean();

  const duplicates = new Map<string, any[]>();
  const invalidLength: any[] = [];
  const invalidChecksum: any[] = [];

  for (const customer of customers) {
    const document = normalizeDocument(customer.cpfCnpj);
    if (![11, 14].includes(document.length)) {
      invalidLength.push(customer);
      continue;
    }
    if (!isValidCpfCnpj(document)) {
      invalidChecksum.push(customer);
      continue;
    }
    const key = `${String(customer.companyId)}:${document}`;
    const list = duplicates.get(key) || [];
    list.push(customer);
    duplicates.set(key, list);
  }

  const duplicateGroups = Array.from(duplicates.values()).filter((group) => group.length > 1);

  console.log(`CPF/CNPJ com tamanho invalido: ${invalidLength.length}`);
  if (invalidLength.length) {
    console.log(`  exemplos: ${ids(invalidLength.slice(0, sampleLimit)).join(", ")}`);
  }

  console.log(`CPF/CNPJ duplicados por digitos: ${duplicateGroups.length}`);
  if (duplicateGroups.length) {
    const examples = duplicateGroups
      .slice(0, sampleLimit)
      .map((group) => group.map((customer) => String(customer._id)).join(" + "));
    console.log(`  exemplos: ${examples.join("; ")}`);
  }

  console.log(`CPF/CNPJ com digitos verificadores invalidos: ${invalidChecksum.length}`);
  if (invalidChecksum.length) {
    console.log(`  exemplos: ${ids(invalidChecksum.slice(0, sampleLimit)).join(", ")}`);
  }
};

const run = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required");

  await mongoose.connect(uri);

  console.log("=== AUDIT SYSTEM CONSISTENCY ===");
  console.log(`company: ${companyFilter || "all"}`);
  console.log(`samples: ${sampleLimit}`);

  await auditBillings();
  await auditCharges();
  await auditInventory();
  await auditRentals();
  await auditInvoices();
  await auditCustomers();

  console.log("");
  console.log("Audit completed. This script is read-only and did not modify data.");

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error("Audit failed:", error);
  await mongoose.disconnect();
  process.exit(1);
});

