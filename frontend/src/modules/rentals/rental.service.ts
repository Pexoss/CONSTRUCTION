import api from '../../config/api';
import { Category } from '../../types/inventory.types';
import {
  Rental,
  CreateRentalData,
  RentalFilters,
  UpdateRentalStatusData,
  ExtendRentalData,
  ChecklistData,
  RentalStatusChangeApproval,
} from '../../types/rental.types';

export const rentalService = {
  getRentals: async (filters: RentalFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.customerId) params.append('customerId', filters.customerId);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    if (filters.search) params.append('search', filters.search);
    if (filters.page) params.append('page', String(filters.page));
    if (filters.limit) params.append('limit', String(filters.limit));

    const response = await api.get<{
      success: boolean;
      data: Rental[];
      pagination: { total: number; page: number; limit: number; totalPages: number };
    }>(`/rentals?${params.toString()}`);
    return response.data;
  },

  getRentalById: async (id: string) => {
    const response = await api.get<{ success: boolean; data: Rental }>(`/rentals/${id}`);
    return response.data;
  },

  createRental: async (data: CreateRentalData) => {
    const response = await api.post<{ success: boolean; message: string; data: Rental }>(
      '/rentals',
      data
    );
    return response.data;
  },

  updateRental: async (id: string, data: { notes?: string; pricing?: { discount?: number } }) => {
    const response = await api.put<{ success: boolean; message: string; data: Rental }>(
      `/rentals/${id}`,
      data
    );
    return response.data;
  },

  updateRentalStatus: async (id: string, data: UpdateRentalStatusData) => {
    const response = await api.patch<{ success: boolean; message: string; data: Rental }>(
      `/rentals/${id}/status`,
      data
    );
    return response.data;
  },

  extendRental: async (id: string, data: ExtendRentalData) => {
    const response = await api.patch<{
      success: boolean;
      message: string;
      data: Rental;
    }>(
      `/rentals/${id}/extend`,
      data
    );

    return response.data;
  },

  updatePickupChecklist: async (id: string, data: ChecklistData) => {
    const response = await api.patch<{ success: boolean; message: string; data: Rental }>(
      `/rentals/${id}/checklist/pickup`,
      data
    );
    return response.data;
  },

  updateReturnChecklist: async (id: string, data: ChecklistData) => {
    const response = await api.patch<{ success: boolean; message: string; data: Rental }>(
      `/rentals/${id}/checklist/return`,
      data
    );
    return response.data;
  },

  checkOverdueRentals: async () => {
    const response = await api.post<{ success: boolean; message: string; count: number }>(
      '/rentals/check-overdue'
    );
    return response.data;
  },

  getExpirationDashboard: async () => {
    const response = await api.get<{
      success: boolean;
      data: {
        expired: Rental[];
        expiringSoon: Rental[];
        expiringToday: Rental[];
        active: number;
        summary: {
          totalExpired: number;
          totalExpiringSoon: number;
          totalExpiringToday: number;
          totalActive: number;
        };
      };
    }>('/rentals/expiration-dashboard');
    return response.data;
  },

  getRentalItemDetails: async (itemId: string, companyId: string) => {
    const response = await api.get<{
      success: boolean;
      data: {
        itemId: string;
        status: 'available' | 'rented' | 'maintenance';
        rentedBy?: { customerId: string; name: string };
        maintenance?: { provider: string; expectedReturnDate: string; cost: number };
        rentalInfo?: { rentalId: string; rentalNumber: string; quantity: number; unitPrice: number; subtotal: number };
      };
    }>(`/rentals/${itemId}/details-status-item`, {
      params: { companyId },
    });

    return response.data;
  },

  //mesmo service do invetory
  getCategories: async (isActive?: boolean) => {
    const params = new URLSearchParams();
    if (isActive !== undefined) {
      params.append('isActive', String(isActive));
    }

    const response = await api.get<{ success: boolean; data: Category[] }>(
      `/inventory/categories?${params.toString()}`
    );

    return response.data.data;
  },

  getPendingStatusChange: async (rentalId: string) => {
    const response = await api.get<{
      success: boolean;
      data: RentalStatusChangeApproval;
    }>(`/rentals/${rentalId}/status-change-requests`);

    return response.data.data;
  },

  rejectStatusChange: async (requestId: string) => {
    const response = await api.post<{
      success: boolean;
      message: string;
    }>(`/rentals/status-change-request/${requestId}/reject`);

    return response.data;
  },

  approveStatusChange: async (requestId: string) => {
    const response = await api.post<{
      success: boolean;
      message: string;
    }>(`/rentals/status-change-request/${requestId}/approve`);

    return response.data;
  },
};
