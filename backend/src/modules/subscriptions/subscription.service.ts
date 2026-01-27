import { SubscriptionPayment } from './subscriptionPayment.model';
import { Company } from '../companies/company.model';
import { Rental } from '../rentals/rental.model';
import { Transaction } from '../transactions/transaction.model';
import { Maintenance } from '../maintenance/maintenance.model';
import { Item } from '../inventory/item.model';
import { Customer } from '../customers/customer.model';
import { ISubscriptionPayment, PaymentStatus, SubscriptionPlan } from './subscriptionPayment.types';
import mongoose from 'mongoose';

class SubscriptionService {
  /**
   * Create a new subscription payment
   */
  async createPayment(companyId: string, data: any): Promise<ISubscriptionPayment> {
    const payment = await SubscriptionPayment.create({
      ...data,
      companyId,
    });

    return payment;
  }

  /**
   * Get all payments for a company
   */
  async getCompanyPayments(
    companyId: string,
    filters: {
      status?: PaymentStatus;
      plan?: SubscriptionPlan;
      startDate?: Date;
      endDate?: Date;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ payments: ISubscriptionPayment[]; total: number; page: number; limit: number }> {
    const query: any = { companyId };

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.plan) {
      query.plan = filters.plan;
    }

    if (filters.startDate || filters.endDate) {
      query.dueDate = {};
      if (filters.startDate) query.dueDate.$gte = filters.startDate;
      if (filters.endDate) query.dueDate.$lte = filters.endDate;
    }

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const [payments, total] = await Promise.all([
      SubscriptionPayment.find(query).sort({ dueDate: -1 }).skip(skip).limit(limit),
      SubscriptionPayment.countDocuments(query),
    ]);

    return { payments, total, page, limit };
  }

  /**
   * Mark payment as paid
   */
  async markPaymentAsPaid(
    companyId: string,
    paymentId: string,
    data: { paidDate?: Date; paymentMethod?: string; notes?: string }
  ): Promise<ISubscriptionPayment> {
    const payment = await SubscriptionPayment.findOne({ _id: paymentId, companyId });

    if (!payment) {
      throw new Error('Payment not found');
    }

    // 1️⃣ Atualiza pagamento
    payment.status = 'paid';
    payment.paidDate = data.paidDate || new Date();
    if (data.paymentMethod) payment.paymentMethod = data.paymentMethod;
    if (data.notes) payment.notes = data.notes;

    await payment.save();

    // 2️⃣ Atualiza assinatura da empresa
    await Company.findByIdAndUpdate(companyId, {
      'subscription.plan': payment.plan,
      'subscription.status': 'active',
      'subscription.lastPaymentDate': payment.paidDate,
      'subscription.paymentDueDate': payment.dueDate,
    });

    return payment;
  }

  /**
   * Get all companies (super admin only)
   */
  async getAllCompanies(filters: {
    subscriptionStatus?: string;
    plan?: SubscriptionPlan;
    search?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<{ companies: any[]; total: number; page: number; limit: number }> {
    const query: any = {};

    if (filters.subscriptionStatus) {
      query['subscription.status'] = filters.subscriptionStatus;
    }

    if (filters.plan) {
      query['subscription.plan'] = filters.plan;
    }

    if (filters.search) {
      query.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { cnpj: { $regex: filters.search, $options: 'i' } },
        { email: { $regex: filters.search, $options: 'i' } },
      ];
    }

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const [companies, total] = await Promise.all([
      Company.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Company.countDocuments(query),
    ]);

    return { companies, total, page, limit };
  }

  /**
   * Get company metrics
   */
  async getCompanyMetrics(companyId: string): Promise<{
    totalRentals: number;
    activeRentals: number;
    totalTransactions: number;
    totalMaintenances: number;
    totalItems: number;
    totalCustomers: number;
    revenue: number;
    expenses: number;
  }> {
    const [rentals, transactions, maintenances, items, customers] = await Promise.all([
      Rental.countDocuments({ companyId }),
      Transaction.find({ companyId }),
      Maintenance.countDocuments({ companyId }),
      Item.countDocuments({ companyId }),
      Customer.countDocuments({ companyId }),
    ]);

    const activeRentals = await Rental.countDocuments({
      companyId,
      status: { $in: ['reserved', 'active'] },
    });

    const revenue = transactions
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    const expenses = transactions
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    return {
      totalRentals: rentals,
      activeRentals,
      totalTransactions: transactions.length,
      totalMaintenances: maintenances,
      totalItems: items,
      totalCustomers: customers,
      revenue,
      expenses,
    };
  }

  /**
   * Check and update overdue payments
   */
  async checkOverduePayments(): Promise<number> {
    const now = new Date();
    const result = await SubscriptionPayment.updateMany(
      {
        status: 'pending',
        dueDate: { $lt: now },
      },
      {
        $set: { status: 'overdue' },
      }
    );

    // Block companies with overdue payments
    const overduePayments = await SubscriptionPayment.find({
      status: 'overdue',
      dueDate: { $lt: now },
    }).select('companyId');

    const companyIds = overduePayments.map((p) => p.companyId);
    if (companyIds.length > 0) {
      await Company.updateMany(
        { _id: { $in: companyIds } },
        { $set: { 'subscription.status': 'suspended' } }
      );
    }

    return result.modifiedCount;
  }

  /**
   * Get upcoming payments (for notifications)
   */
  async getUpcomingPayments(days: number = 7): Promise<ISubscriptionPayment[]> {
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + days);

    return SubscriptionPayment.find({
      status: 'pending',
      dueDate: {
        $gte: today,
        $lte: futureDate,
      },
    })
      .populate('companyId', 'name email')
      .sort({ dueDate: 1 });
  }

  async deleteCompany(companyId: string) {
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      throw new Error('ID da empresa inválido');
    }

    const company = await Company.findById(companyId);

    if (!company) {
      throw new Error('Empresa não encontrada');
    }

    await Company.findByIdAndDelete(companyId);

    return company;
  }
}

export const subscriptionService = new SubscriptionService();
