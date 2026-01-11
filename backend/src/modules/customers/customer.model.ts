import mongoose, { Schema, Model } from 'mongoose';
import { ICustomer } from './customer.types';

const CustomerSchema = new Schema<ICustomer>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: [true, 'Company ID is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
    },
    cpfCnpj: {
      type: String,
      required: [true, 'CPF/CNPJ is required'],
      trim: true,
      index: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    phone: {
      type: String,
      trim: true,
    },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: { type: String, default: 'Brasil' },
    },
    notes: {
      type: String,
      trim: true,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for unique CPF/CNPJ per company
CustomerSchema.index({ companyId: 1, cpfCnpj: 1 }, { unique: true });

// Index for search
CustomerSchema.index({ companyId: 1, name: 1 });
CustomerSchema.index({ companyId: 1, email: 1 });

export const Customer: Model<ICustomer> = mongoose.model<ICustomer>('Customer', CustomerSchema);
