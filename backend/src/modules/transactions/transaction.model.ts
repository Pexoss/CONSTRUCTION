import mongoose, { Schema, Model } from 'mongoose';
import { ITransaction, ITransactionRelatedTo } from './transaction.types';

const TransactionRelatedToSchema = new Schema<ITransactionRelatedTo>(
  {
    type: {
      type: String,
      enum: ['rental', 'maintenance', 'other'],
      required: true,
    },
    id: {
      type: Schema.Types.ObjectId,
      required: true,
      refPath: 'relatedTo.type',
    },
  },
  { _id: false }
);

const TransactionSchema = new Schema<ITransaction>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: [true, 'Company ID is required'],
      index: true,
    },
    type: {
      type: String,
      enum: ['income', 'expense'],
      required: [true, 'Transaction type is required'],
      index: true,
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true,
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: 0,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
    },
    relatedTo: {
      type: TransactionRelatedToSchema,
    },
    paymentMethod: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'overdue', 'cancelled'],
      default: 'pending',
      index: true,
    },
    dueDate: {
      type: Date,
      index: true,
    },
    paidDate: {
      type: Date,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
TransactionSchema.index({ companyId: 1, type: 1 });
TransactionSchema.index({ companyId: 1, status: 1 });
TransactionSchema.index({ companyId: 1, category: 1 });
TransactionSchema.index({ companyId: 1, dueDate: 1 });
TransactionSchema.index({ companyId: 1, 'relatedTo.type': 1, 'relatedTo.id': 1 });

export const Transaction: Model<ITransaction> = mongoose.model<ITransaction>(
  'Transaction',
  TransactionSchema
);
