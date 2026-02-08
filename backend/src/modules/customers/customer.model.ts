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
    // NOVO: Dados validados pela Receita Federal
    validated: {
      isValidated: {
        type: Boolean,
        default: false,
      },
      validatedAt: Date,
      cpfName: String, // Nome retornado pela Receita
      birthDate: Date,
      additionalInfo: Schema.Types.Mixed, // Outros dados da API
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

    // NOVO: Array de endereços (substitui o campo address único)
    addresses: [{
      addressName: {
        type: String,
        required: function () {
          return this.type === 'work';
        },
      },
      type: {
        type: String,
        enum: ['main', 'billing', 'work', 'other'],
        required: true,
      },
      street: {
        type: String,
        required: true,
      },
      number: String,
      complement: String,
      neighborhood: String,
      city: {
        type: String,
        required: true,
      },
      state: {
        type: String,
        required: true,
      },
      zipCode: {
        type: String,
        required: true,
      },
      isDefault: {
        type: Boolean,
        default: false,
      },
      notes: String,
    }],

    // NOVO: Obras do cliente
    works: [{
      workId: {
        type: Schema.Types.ObjectId,
        required: true,
      },
      workName: {
        type: String,
        required: true,
      },
      addressIndex: {
        type: Number,
        required: true,
        min: 0,
      },
      startDate: {
        type: Date,
        required: true,
      },
      expectedEndDate: Date,
      status: {
        type: String,
        enum: ['active', 'paused', 'completed'],
        default: 'active',
      },
      activeRentals: [{
        type: Schema.Types.ObjectId,
        ref: 'Rental',
      }],
      notes: String,
    }],

    notes: {
      type: String,
      trim: true,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    blockReason: {
      type: String,
      trim: true,
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
