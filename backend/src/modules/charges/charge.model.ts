import mongoose, { Model, Schema } from "mongoose";
import { ICharge, IChargePayment } from "./charge.types";

const ChargePaymentSchema = new Schema<IChargePayment>(
  {
    amount: { type: Number, required: true, min: 0 },
    discount: { type: Number, min: 0, default: 0 },
    paidAt: { type: Date, required: true },
    paymentMethod: { type: String, trim: true },
    notes: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { _id: false },
);

const ChargeSchema = new Schema<ICharge>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    billingIds: [{ type: Schema.Types.ObjectId, ref: "Billing", required: true }],
    chargeNumber: { type: String, required: true, unique: true },
    dueDate: { type: Date },
    status: {
      type: String,
      enum: ["pending", "partial", "paid", "cancelled"],
      default: "pending",
      index: true,
    },
    total: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, required: true, min: 0, default: 0 },
    outstandingAmount: { type: Number, required: true, min: 0 },
    payments: { type: [ChargePaymentSchema], default: [] },
    notes: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

ChargeSchema.index({ companyId: 1, customerId: 1, status: 1 });

ChargeSchema.pre("validate", async function (next) {
  if (this.chargeNumber) return next();
  const year = new Date().getFullYear();
  const prefix = `COB-${year}-`;
  const ChargeModel = mongoose.model<ICharge>("Charge");
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const [agg] = await ChargeModel.aggregate([
    { $match: { companyId: this.companyId, chargeNumber: { $regex: `^${escaped}\\d{6}$` } } },
    {
      $addFields: {
        seq: { $toInt: { $substrCP: ["$chargeNumber", prefix.length, 6] } },
      },
    },
    { $group: { _id: null, maxSeq: { $max: "$seq" } } },
  ]);
  const nextSeq = (agg?.maxSeq ?? 0) + 1;
  this.chargeNumber = `${prefix}${String(nextSeq).padStart(6, "0")}`;
  next();
});

export const Charge: Model<ICharge> = mongoose.model<ICharge>("Charge", ChargeSchema);

