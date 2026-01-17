import api from '../../config/api';
import { Customer, CreateCustomerData, CustomerFilters, CustomerAddress } from '../../types/customer.types';

export const customerService = {
  getCustomers: async (filters: CustomerFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.search) params.append('search', filters.search);
    if (filters.isBlocked !== undefined) params.append('isBlocked', String(filters.isBlocked));
    if (filters.page) params.append('page', String(filters.page));
    if (filters.limit) params.append('limit', String(filters.limit));

    const response = await api.get<{
      success: boolean;
      data: Customer[];
      pagination: { total: number; page: number; limit: number; totalPages: number };
    }>(`/customers?${params.toString()}`);
    return response.data;
  },

  getCustomerById: async (id: string) => {
    const response = await api.get<{ success: boolean; data: Customer }>(`/customers/${id}`);
    return response.data;
  },

  createCustomer: async (data: CreateCustomerData) => {
    const response = await api.post<{ success: boolean; message: string; data: Customer }>(
      '/customers',
      data
    );
    return response.data;
  },

  updateCustomer: async (id: string, data: Partial<CreateCustomerData>) => {
    const response = await api.put<{ success: boolean; message: string; data: Customer }>(
      `/customers/${id}`,
      data
    );
    return response.data;
  },

  deleteCustomer: async (id: string) => {
    const response = await api.delete<{ success: boolean; message: string }>(`/customers/${id}`);
    return response.data;
  },

  toggleBlockCustomer: async (id: string, isBlocked: boolean) => {
    const response = await api.patch<{ success: boolean; message: string; data: Customer }>(
      `/customers/${id}/block`,
      { isBlocked }
    );
    return response.data;
  },

  addAddress: async (customerId: string, addressData: CustomerAddress) => {
    const response = await api.post<{
      success: boolean;
      message: string;
      data: Customer;
    }>(`/customers/${customerId}/addresses`, addressData);

    return response.data.data; // retorna o cliente atualizado
  }
};
