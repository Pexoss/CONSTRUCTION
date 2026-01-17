import { Transaction } from './transaction.model';
import { Rental } from '../rentals/rental.model';
import { Maintenance } from '../maintenance/maintenance.model';
import { ITransaction, TransactionType, TransactionStatus } from './transaction.types';
import mongoose from 'mongoose';

class TransactionService {
  /**
   * Create a new transaction
   */
  async createTransaction(companyId: string, data: any, userId: string): Promise<ITransaction> {
    // If related to rental or maintenance, verify it exists
    if (data.relatedTo) {
      if (data.relatedTo.type === 'rental') {
        const rental = await Rental.findOne({ _id: data.relatedTo.id, companyId });
        if (!rental) {
          throw new Error('Rental not found');
        }
      } else if (data.relatedTo.type === 'maintenance') {
        const maintenance = await Maintenance.findOne({ _id: data.relatedTo.id, companyId });
        if (!maintenance) {
          throw new Error('Maintenance not found');
        }
      }
    }

    const transaction = await Transaction.create({
      ...data,
      companyId,
      createdBy: userId,
    });

    return transaction;
  }

  /**
   * Get all transactions with filters
   */
  async getTransactions(
    companyId: string,
    filters: {
      type?: TransactionType;
      category?: string;
      status?: TransactionStatus;
      relatedToType?: string;
      relatedToId?: string;
      startDate?: Date;
      endDate?: Date;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ transactions: ITransaction[]; total: number; page: number; limit: number }> {
    const query: any = { companyId };

    if (filters.type) {
      query.type = filters.type;
    }

    if (filters.category) {
      query.category = filters.category;
    }

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.relatedToType) {
      query['relatedTo.type'] = filters.relatedToType;
    }

    if (filters.relatedToId) {
      query['relatedTo.id'] = filters.relatedToId;
    }

    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) query.createdAt.$gte = filters.startDate;
      if (filters.endDate) query.createdAt.$lte = filters.endDate;
    }

    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Transaction.countDocuments(query),
    ]);

    return { transactions, total, page, limit };
  }

  /**
   * Get transaction by ID
   */
  async getTransactionById(companyId: string, transactionId: string): Promise<ITransaction | null> {
    return Transaction.findOne({ _id: transactionId, companyId })
      .populate('createdBy', 'name email')
      .populate('relatedTo.id');
  }

  /**
   * Update transaction
   */
  async updateTransaction(
    companyId: string,
    transactionId: string,
    data: any
  ): Promise<ITransaction | null> {
    const transaction = await Transaction.findOne({ _id: transactionId, companyId });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    // If marking as paid, set paidDate
    if (data.status === 'paid' && transaction.status !== 'paid') {
      data.paidDate = data.paidDate || new Date();
    }

    Object.assign(transaction, data);
    await transaction.save();

    return transaction;
  }

  /**
   * Delete transaction
   */
  async deleteTransaction(companyId: string, transactionId: string): Promise<boolean> {
    const result = await Transaction.deleteOne({ _id: transactionId, companyId });
    return result.deletedCount > 0;
  }

  /**
   * Get financial dashboard data
   */
  async getFinancialDashboard(companyId: string, startDate?: Date, endDate?: Date): Promise<{
    totalIncome: number;
    totalExpenses: number;
    profit: number;
    accountsReceivable: number;
    accountsPayable: number;
    cashFlow: Array<{ date: string; income: number; expenses: number; balance: number }>;
    byCategory: Array<{ category: string; income: number; expenses: number }>;
  }> {
    const dateFilter: any = { companyId };
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = startDate;
      if (endDate) dateFilter.createdAt.$lte = endDate;
    }

    const transactions = await Transaction.find(dateFilter);

    let totalIncome = 0;
    let totalExpenses = 0;
    let accountsReceivable = 0;
    let accountsPayable = 0;

    const categoryMap: Record<string, { income: number; expenses: number }> = {};
    const cashFlowMap: Record<string, { income: number; expenses: number }> = {};

    transactions.forEach((transaction) => {
      const dateKey = transaction.createdAt?.toISOString().split('T')[0] || '';
      
      if (!cashFlowMap[dateKey]) {
        cashFlowMap[dateKey] = { income: 0, expenses: 0 };
      }

      if (transaction.type === 'income') {
        totalIncome += transaction.amount;
        cashFlowMap[dateKey].income += transaction.amount;
        if (transaction.status === 'pending') {
          accountsReceivable += transaction.amount;
        }
      } else {
        totalExpenses += transaction.amount;
        cashFlowMap[dateKey].expenses += transaction.amount;
        if (transaction.status === 'pending') {
          accountsPayable += transaction.amount;
        }
      }

      if (!categoryMap[transaction.category]) {
        categoryMap[transaction.category] = { income: 0, expenses: 0 };
      }
      if (transaction.type === 'income') {
        categoryMap[transaction.category].income += transaction.amount;
      } else {
        categoryMap[transaction.category].expenses += transaction.amount;
      }
    });

    const profit = totalIncome - totalExpenses;

    const cashFlow = Object.entries(cashFlowMap)
      .map(([date, values]) => ({
        date,
        income: values.income,
        expenses: values.expenses,
        balance: values.income - values.expenses,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const byCategory = Object.entries(categoryMap).map(([category, values]) => ({
      category,
      income: values.income,
      expenses: values.expenses,
    }));

    return {
      totalIncome,
      totalExpenses,
      profit,
      accountsReceivable,
      accountsPayable,
      cashFlow,
      byCategory,
    };
  }

  /**
   * Get accounts receivable (pending income)
   */
  async getAccountsReceivable(companyId: string): Promise<ITransaction[]> {
    return Transaction.find({
      companyId,
      type: 'income',
      status: { $in: ['pending', 'overdue'] },
    })
      .populate('relatedTo.id')
      .sort({ dueDate: 1 });
  }

  /**
   * Get accounts payable (pending expenses)
   */
  async getAccountsPayable(companyId: string): Promise<ITransaction[]> {
    return Transaction.find({
      companyId,
      type: 'expense',
      status: { $in: ['pending', 'overdue'] },
    })
      .populate('relatedTo.id')
      .sort({ dueDate: 1 });
  }

  /**
   * Check and update overdue transactions
   */
  async checkOverdueTransactions(companyId: string): Promise<number> {
    const now = new Date();
    const result = await Transaction.updateMany(
      {
        companyId,
        status: 'pending',
        dueDate: { $lt: now, $exists: true },
      },
      {
        $set: { status: 'overdue' },
      }
    );

    return result.modifiedCount;
  }
}

export const transactionService = new TransactionService();
