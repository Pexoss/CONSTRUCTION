import { Rental } from './rental.types';
import { Maintenance } from './maintenance.types';

export type TransactionType = 'income' | 'expense';
export type TransactionStatus = 'pending' | 'paid' | 'overdue' | 'cancelled';
export type RelatedToType = 'rental' | 'maintenance' | 'other';

export interface TransactionRelatedTo {
  type: RelatedToType;
  id: string | Rental | Maintenance;
}

export interface Transaction {
  _id: string;
  companyId: string;
  type: TransactionType;
  category: string;
  amount: number;
  description: string;
  relatedTo?: TransactionRelatedTo;
  paymentMethod?: string;
  status: TransactionStatus;
  dueDate?: string;
  paidDate?: string;
  createdBy: string | { name: string; email: string };
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateTransactionData {
  type: TransactionType;
  category: string;
  amount: number;
  description: string;
  relatedTo?: {
    type: RelatedToType;
    id: string;
  };
  paymentMethod?: string;
  status?: TransactionStatus;
  dueDate?: string;
  paidDate?: string;
}

export interface TransactionFilters {
  type?: TransactionType;
  category?: string;
  status?: TransactionStatus;
  relatedToType?: string;
  relatedToId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface FinancialDashboard {
  totalIncome: number;
  totalExpenses: number;
  profit: number;
  accountsReceivable: number;
  accountsPayable: number;
  cashFlow: Array<{ date: string; income: number; expenses: number; balance: number }>;
  byCategory: Array<{ category: string; income: number; expenses: number }>;
}
