import api from '../../config/api';
import { Invoice, CreateInvoiceFromRentalData, InvoiceFilters, InvoiceStatus } from '../../types/invoice.types';

export const invoiceService = {
  createInvoiceFromRental: async (data: CreateInvoiceFromRentalData) => {
    const response = await api.post<{ success: boolean; message: string; data: Invoice }>(
      '/invoices/from-rental',
      data
    );
    return response.data;
  },

  getInvoices: async (filters: InvoiceFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.customerId) params.append('customerId', filters.customerId);
    if (filters.rentalId) params.append('rentalId', filters.rentalId);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    if (filters.page) params.append('page', String(filters.page));
    if (filters.limit) params.append('limit', String(filters.limit));

    const response = await api.get<{
      success: boolean;
      data: Invoice[];
      pagination: { total: number; page: number; limit: number; totalPages: number };
    }>(`/invoices?${params.toString()}`);
    return response.data;
  },

  getInvoiceById: async (id: string) => {
    const response = await api.get<{ success: boolean; data: Invoice }>(`/invoices/${id}`);
    return response.data;
  },

  generateInvoicePDF: async (id: string) => {
    const response = await api.get(`/invoices/${id}/pdf`, {
      responseType: 'blob',
    });
    return response.data;
  },

  updateInvoiceStatus: async (id: string, status: InvoiceStatus) => {
    const response = await api.patch<{ success: boolean; message: string; data: Invoice }>(
      `/invoices/${id}/status`,
      { status }
    );
    return response.data;
  },

  updateInvoice: async (id: string, data: Partial<{ tax?: number; discount?: number; terms?: string; notes?: string; dueDate?: string }>) => {
    const response = await api.put<{ success: boolean; message: string; data: Invoice }>(
      `/invoices/${id}`,
      data
    );
    return response.data;
  },

  deleteInvoice: async (id: string) => {
    const response = await api.delete<{ success: boolean; message: string }>(`/invoices/${id}`);
    return response.data;
  },
};
