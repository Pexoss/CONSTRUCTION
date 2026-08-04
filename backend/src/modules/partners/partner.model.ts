import mongoose, { Schema, Model } from "mongoose";
import { IPartner } from "./partner.types";

const PartnerSchema = new Schema<IPartner>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Nome do parceiro é obrigatório"],
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    document: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true },
);

PartnerSchema.index({ companyId: 1, name: 1 });
PartnerSchema.index({ companyId: 1, isActive: 1 });

export const Partner: Model<IPartner> = mongoose.model<IPartner>(
  "Partner",
  PartnerSchema,
);
