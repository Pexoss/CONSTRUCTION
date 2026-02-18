import api from '../../config/api';
import {
  SubscriptionPayment,
  CreatePaymentData,
  CompanyMetrics,
  Company,
} from '../../types/subscription.types';

export const subscriptionService = {
  createPayment: async (data: CreatePaymentData) => {
    const response = await api.post<{ success: boolean; message: string; data: SubscriptionPayment }>(
      '/admin/subscriptions/payments',
      data
    );
    return response.data;
  },

  getCompanyPayments: async (companyId?: string, filters?: {
    status?: string;
    plan?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.plan) params.append('plan', filters.plan);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.limit) params.append('limit', String(filters.limit));

    const response = await api.get<{
      success: boolean;
      data: SubscriptionPayment[];
      pagination: { total: number; page: number; limit: number; totalPages: number };
    }>(`/admin/subscriptions/payments?${params.toString()}`);
    return response.data;
  },

  markPaymentAsPaid: async (
    paymentId: string,
    companyId: string,
    data: { paidDate?: string; paymentMethod?: string; notes?: string }
  ) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId);

    const response = await api.patch<{
      success: boolean;
      message: string;
      data: { payment: SubscriptionPayment; company: Company };
    }>(`/admin/subscriptions/payments/${paymentId}/paid?${params.toString()}`, data);

    return response.data.data;
  },

  getAllCompanies: async (filters?: {
    subscriptionStatus?: string;
    plan?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) => {
    const params = new URLSearchParams();
    if (filters?.subscriptionStatus) params.append('subscriptionStatus', filters.subscriptionStatus);
    if (filters?.plan) params.append('plan', filters.plan);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.limit) params.append('limit', String(filters.limit));

    const response = await api.get<{
      success: boolean;
      data: Company[];
      pagination: { total: number; page: number; limit: number; totalPages: number };
    }>(`/admin/companies?${params.toString()}`);
    return response.data;
  },

  getCompanyMetrics: async (companyId: string) => {
    const response = await api.get<{ success: boolean; data: CompanyMetrics }>(
      `/admin/companies/${companyId}/metrics`
    );
    return response.data;
  },

  getUpcomingPayments: async (days: number = 7) => {
    const response = await api.get<{ success: boolean; data: SubscriptionPayment[]; count: number }>(
      `/admin/subscriptions/upcoming?days=${days}`
    );
    return response.data;
  },

  checkOverduePayments: async () => {
    const response = await api.post<{ success: boolean; message: string; count: number }>(
      '/admin/subscriptions/check-overdue'
    );
    return response.data;
  },

  deleteCompany: async (companyId: string) => {
    const response = await api.delete<{
      success: boolean;
      message: string;
    }>(`/admin/companies/${companyId}`);

    return response.data;
  },

  updateCompanyCpfCnpjToken: async (
    companyId: string,
    payload: { token?: string; cpfPackageId?: string; cnpjPackageId?: string }
  ) => {
    const response = await api.patch<{
      success: boolean;
      message: string;
      data: { configured: boolean; cpfPackageId?: string; cnpjPackageId?: string };
    }>(`/admin/companies/${companyId}/cpfcnpj-token`, payload);
    return response.data;
  },

  getCompanyCpfCnpjSettings: async (companyId: string) => {
    const response = await api.get<{
      success: boolean;
      data: { tokenConfigured: boolean; cpfPackageId: string; cnpjPackageId: string };
    }>(`/admin/companies/${companyId}/cpfcnpj-settings`);
    return response.data.data;
  },

};
