import mongoose, { Schema, Model } from "mongoose";
import { IPartnerLoan } from "./partner.types";

const PartnerLoanSchema = new Schema<IPartnerLoan>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    partnerId: {
      type: Schema.Types.ObjectId,
      ref: "Partner",
      required: true,
      index: true,
    },
    rentalId: {
      type: Schema.Types.ObjectId,
      ref: "Rental",
      required: true,
      index: true,
    },
    lineId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    itemId: {
      type: Schema.Types.ObjectId,
      ref: "Item",
      required: true,
      index: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    ownQuantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    quantityWithCustomer: {
      type: Number,
      required: true,
      min: 0,
    },
    agreedCost: {
      type: Number,
      min: 0,
    },
    notes: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: [
        "with_customer",
        "awaiting_partner_return",
        "returned_to_partner",
        "cancelled",
      ],
      default: "with_customer",
      index: true,
    },
    returnedToPartnerQty: {
      type: Number,
      min: 0,
      default: 0,
    },
    returnedToPartnerAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

PartnerLoanSchema.index({ companyId: 1, status: 1 });
PartnerLoanSchema.index({ companyId: 1, partnerId: 1, status: 1 });
PartnerLoanSchema.index(
  { companyId: 1, rentalId: 1, lineId: 1 },
  { unique: true },
);

export const PartnerLoan: Model<IPartnerLoan> = mongoose.model<IPartnerLoan>(
  "PartnerLoan",
  PartnerLoanSchema,
);
