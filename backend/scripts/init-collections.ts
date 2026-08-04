import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { Billing } from "../src/modules/billings/billing.model";
import { Charge } from "../src/modules/charges/charge.model";
import { Company } from "../src/modules/companies/company.model";
import { ensureCustomerIndexes } from "../src/modules/customers/customer.index.util";
import { Customer } from "../src/modules/customers/customer.model";
import { Category } from "../src/modules/inventory/category.model";
import { Item } from "../src/modules/inventory/item.model";
import { ItemMovement } from "../src/modules/inventory/itemMovement.model";
import { Subcategory } from "../src/modules/inventory/subcategory.model";
import { Invoice } from "../src/modules/invoices/invoice.model";
import { Maintenance } from "../src/modules/maintenance/maintenance.model";
import {
  NotificationModel,
  NotificationUserModel,
} from "../src/modules/notification/notification.validator";
import { RentalCpfBypassToken } from "../src/modules/rentals/rental-cpf-bypass.model";
import { Rental } from "../src/modules/rentals/rental.model";
import { SubscriptionPayment } from "../src/modules/subscriptions/subscriptionPayment.model";
import { Transaction } from "../src/modules/transactions/transaction.model";
import { User } from "../src/modules/users/user.model";
import { Partner } from "../src/modules/partners/partner.model";
import { PartnerLoan } from "../src/modules/partners/partner-loan.model";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const syncTasks: Array<{ name: string; sync: () => Promise<void> }> = [
  { name: "Company", sync: async () => { await Company.syncIndexes(); } },
  { name: "User", sync: async () => { await User.syncIndexes(); } },
  { name: "Customer", sync: ensureCustomerIndexes },
  { name: "Category", sync: async () => { await Category.syncIndexes(); } },
  { name: "Subcategory", sync: async () => { await Subcategory.syncIndexes(); } },
  { name: "Item", sync: async () => { await Item.syncIndexes(); } },
  { name: "ItemMovement", sync: async () => { await ItemMovement.syncIndexes(); } },
  { name: "Rental", sync: async () => { await Rental.syncIndexes(); } },
  {
    name: "RentalCpfBypassToken",
    sync: async () => { await RentalCpfBypassToken.syncIndexes(); },
  },
  { name: "Maintenance", sync: async () => { await Maintenance.syncIndexes(); } },
  { name: "Partner", sync: async () => { await Partner.syncIndexes(); } },
  { name: "PartnerLoan", sync: async () => { await PartnerLoan.syncIndexes(); } },
  { name: "Charge", sync: async () => { await Charge.syncIndexes(); } },
  { name: "Billing", sync: async () => { await Billing.syncIndexes(); } },
  { name: "Transaction", sync: async () => { await Transaction.syncIndexes(); } },
  {
    name: "SubscriptionPayment",
    sync: async () => { await SubscriptionPayment.syncIndexes(); },
  },
  { name: "Invoice", sync: async () => { await Invoice.syncIndexes(); } },
  {
    name: "Notification",
    sync: async () => { await NotificationModel.syncIndexes(); },
  },
  {
    name: "NotificationUser",
    sync: async () => { await NotificationUserModel.syncIndexes(); },
  },
];

const run = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is required");
  }

  await mongoose.connect(uri);
  console.log("Connected to MongoDB");

  for (const { name, sync } of syncTasks) {
    await sync();
    console.log(`[${name}] indexes synced`);
  }

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("MongoDB connection is not ready");
  }

  const collections = await db.listCollections().toArray();

  console.log("\nCollections in database:");
  for (const collection of collections.sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    console.log(`  - ${collection.name}`);
  }

  await mongoose.disconnect();
  console.log("\nDone.");
};

run().catch((error) => {
  console.error("Failed to initialize collections:", error);
  process.exit(1);
});
