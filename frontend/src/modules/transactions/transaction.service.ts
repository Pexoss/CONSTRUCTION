import api from '../../config/api';
import {
  Transaction,
  CreateTransactionData,
  TransactionFilters,
  FinancialDashboard,
} from '../../types/transaction.types';

export const transactionService = {
  getTransactions: async (filters: TransactionFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.type) params.append('type', filters.type);
    if (filters.category) params.append('category', filters.category);
    if (filters.status) params.append('status', filters.status);
    if (filters.relatedToType) params.append('relatedToType', filters.relatedToType);
    if (filters.relatedToId) params.append('relatedToId', filters.relatedToId);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    if (filters.page) params.append('page', String(filters.page));
    if (filters.limit) params.append('limit', String(filters.limit));

    const response = await api.get<{
      success: boolean;
      data: Transaction[];
      pagination: { total: number; page: number; limit: number; totalPages: number };
    }>(`/transactions?${params.toString()}`);
    return response.data;
  },

  getTransactionById: async (id: string) => {
    const response = await api.get<{ success: boolean; data: Transaction }>(`/transactions/${id}`);
    return response.data;
  },

  createTransaction: async (data: CreateTransactionData) => {
    const response = await api.post<{ success: boolean; message: string; data: Transaction }>(
      '/transactions',
      data
    );
    return response.data;
  },

  updateTransaction: async (id: string, data: Partial<CreateTransactionData>) => {
    const response = await api.put<{ success: boolean; message: string; data: Transaction }>(
      `/transactions/${id}`,
      data
    );
    return response.data;
  },

  deleteTransaction: async (id: string) => {
    const response = await api.delete<{ success: boolean; message: string }>(`/transactions/${id}`);
    return response.data;
  },

  getFinancialDashboard: async (startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    const response = await api.get<{ success: boolean; data: FinancialDashboard }>(
      `/transactions/dashboard?${params.toString()}`
    );
    return response.data;
  },

  getAccountsReceivable: async () => {
    const response = await api.get<{ success: boolean; data: Transaction[]; count: number }>(
      '/transactions/receivable'
    );
    return response.data;
  },

  getAccountsPayable: async () => {
    const response = await api.get<{ success: boolean; data: Transaction[]; count: number }>(
      '/transactions/payable'
    );
    return response.data;
  },

  checkOverdueTransactions: async () => {
    const response = await api.post<{ success: boolean; message: string; count: number }>(
      '/transactions/check-overdue'
    );
    return response.data;
  },
};
