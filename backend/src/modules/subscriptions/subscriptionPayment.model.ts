import mongoose, { Schema, Model } from 'mongoose';
import { ISubscriptionPayment } from './subscriptionPayment.types';

const SubscriptionPaymentSchema = new Schema<ISubscriptionPayment>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: [true, 'Company ID is required'],
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: 0,
    },
    plan: {
      type: String,
      enum: ['basic', 'pro', 'enterprise'],
      required: [true, 'Plan is required'],
      index: true,
    },
    dueDate: {
      type: Date,
      required: [true, 'Due date is required'],
      index: true,
    },
    paidDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'overdue'],
      default: 'pending',
      index: true,
    },
    paymentMethod: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
SubscriptionPaymentSchema.index({ companyId: 1, status: 1 });
SubscriptionPaymentSchema.index({ companyId: 1, dueDate: 1 });
SubscriptionPaymentSchema.index({ companyId: 1, plan: 1 });

export const SubscriptionPayment: Model<ISubscriptionPayment> = mongoose.model<ISubscriptionPayment>(
  'SubscriptionPayment',
  SubscriptionPaymentSchema
);
