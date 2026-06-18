import mongoose, { Schema, Document } from "mongoose";

export interface IRentalCpfBypassToken extends Document {
  companyId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  requestedBy: mongoose.Types.ObjectId;
  code: string;
  expiresAt: Date;
  usedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const RentalCpfBypassTokenSchema = new Schema<IRentalCpfBypassToken>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    code: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    usedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

RentalCpfBypassTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RentalCpfBypassToken = mongoose.model<IRentalCpfBypassToken>(
  "RentalCpfBypassToken",
  RentalCpfBypassTokenSchema,
);
