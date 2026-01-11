import { Document } from 'mongoose';
import mongoose from 'mongoose';

export type TransactionType = 'income' | 'expense';
export type TransactionStatus = 'pending' | 'paid' | 'overdue' | 'cancelled';
export type RelatedToType = 'rental' | 'maintenance' | 'other';

export interface ITransactionRelatedTo {
  type: RelatedToType;
  id: mongoose.Types.ObjectId;
}

export interface ITransaction extends Document {
  companyId: mongoose.Types.ObjectId;
  type: TransactionType;
  category: string;
  amount: number;
  description: string;
  relatedTo?: ITransactionRelatedTo;
  paymentMethod?: string;
  status: TransactionStatus;
  dueDate?: Date;
  paidDate?: Date;
  createdBy: mongoose.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}
