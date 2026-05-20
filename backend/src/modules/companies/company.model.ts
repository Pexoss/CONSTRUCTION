import mongoose, { Schema, Model } from 'mongoose';
import { ICompany } from './company.types';
import { isValidCnpj, normalizeDocument } from '../../shared/utils/document.utils';

const CompanyInvoiceIssuerSchema = new Schema(
  {
    label: {
      type: String,
      trim: true,
      default: 'Matriz',
    },
    cnpj: {
      type: String,
      required: [true, 'CNPJ é obrigatório'],
      trim: true,
      validate: {
        validator(v: string) {
          const d = normalizeDocument(v || '');
          return d.length === 14 && isValidCnpj(d);
        },
        message: 'CNPJ inválido para emissor de fatura',
      },
    },
    /** Primeiro número da série numérica para este CNPJ emissor (depois segue maxexistente+1). */
    initialInvoiceNumber: {
      type: Number,
      default: 1,
      min: 1,
    },
  },
  { _id: true },
);

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
    invoiceIssuers: {
      type: [CompanyInvoiceIssuerSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Indexes (unique já definido no schema, não duplicar)
CompanySchema.index({ 'subscription.status': 1 });

export const Company: Model<ICompany> = mongoose.model<ICompany>('Company', CompanySchema);
