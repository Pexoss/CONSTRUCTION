import { Document } from 'mongoose';
import mongoose from 'mongoose';

export type PaymentStatus = 'pending' | 'paid' | 'overdue';
export type SubscriptionPlan = 'basic' | 'pro' | 'enterprise';

export interface ISubscriptionPayment extends Document {
  companyId: mongoose.Types.ObjectId;
  amount: number;
  plan: SubscriptionPlan;
  dueDate: Date;
  paidDate?: Date;
  status: PaymentStatus;
  paymentMethod?: string;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
