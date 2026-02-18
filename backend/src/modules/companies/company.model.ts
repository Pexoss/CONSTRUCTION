import mongoose, { Schema, Model } from 'mongoose';
import { ICompany } from './company.types';

const CompanySchema = new Schema<ICompany>(
  {
    name: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
    },
    cnpj: {
      type: String,
      required: false,
      unique: true,
      sparse: true, 
      trim: true,
      validate: {
        validator: function (v: string) {
          if (!v) return true; // aceita undefined / null
          const cleanCnpj = v.replace(/\D/g, '');
          return cleanCnpj.length === 14;
        },
        message: 'CNPJ must have 14 digits',
      },
    },

    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    phone: {
      type: String,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      index: true,
    },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: { type: String, default: 'Brasil' },
    },
    subscription: {
      plan: {
        type: String,
        enum: ['basic', 'pro', 'enterprise'],
        default: 'basic',
      },
      status: {
        type: String,
        enum: ['active', 'suspended', 'cancelled'],
        default: 'active',
      },
      paymentDueDate: Date,
      lastPaymentDate: Date,
    },
    settings: {
      type: Schema.Types.Mixed,
      default: {},
    },
    cpfCnpjToken: {
      type: String,
      trim: true,
    },
    cpfCnpjCpfPackageId: {
      type: String,
      trim: true,
    },
    cpfCnpjCnpjPackageId: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes (unique já definido no schema, não duplicar)
CompanySchema.index({ 'subscription.status': 1 });

export const Company: Model<ICompany> = mongoose.model<ICompany>('Company', CompanySchema);
