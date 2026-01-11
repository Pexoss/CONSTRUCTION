import api from '../../config/api';
import {
  Maintenance,
  CreateMaintenanceData,
  MaintenanceFilters,
  UpdateMaintenanceStatusData,
  MaintenanceStatistics,
} from '../../types/maintenance.types';

export const maintenanceService = {
  getMaintenances: async (filters: MaintenanceFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.itemId) params.append('itemId', filters.itemId);
    if (filters.type) params.append('type', filters.type);
    if (filters.status) params.append('status', filters.status);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    if (filters.page) params.append('page', String(filters.page));
    if (filters.limit) params.append('limit', String(filters.limit));

    const response = await api.get<{
      success: boolean;
      data: Maintenance[];
      pagination: { total: number; page: number; limit: number; totalPages: number };
    }>(`/maintenance?${params.toString()}`);
    return response.data;
  },

  getMaintenanceById: async (id: string) => {
    const response = await api.get<{ success: boolean; data: Maintenance }>(`/maintenance/${id}`);
    return response.data;
  },

  createMaintenance: async (data: CreateMaintenanceData) => {
    const response = await api.post<{ success: boolean; message: string; data: Maintenance }>(
      '/maintenance',
      data
    );
    return response.data;
  },

  updateMaintenance: async (id: string, data: Partial<CreateMaintenanceData>) => {
    const response = await api.put<{ success: boolean; message: string; data: Maintenance }>(
      `/maintenance/${id}`,
      data
    );
    return response.data;
  },

  updateMaintenanceStatus: async (id: string, data: UpdateMaintenanceStatusData) => {
    const response = await api.patch<{ success: boolean; message: string; data: Maintenance }>(
      `/maintenance/${id}/status`,
      data
    );
    return response.data;
  },

  deleteMaintenance: async (id: string) => {
    const response = await api.delete<{ success: boolean; message: string }>(`/maintenance/${id}`);
    return response.data;
  },

  getItemMaintenanceHistory: async (
    itemId: string,
    filters?: { type?: string; status?: string; page?: number; limit?: number }
  ) => {
    const params = new URLSearchParams();
    if (filters?.type) params.append('type', filters.type);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.limit) params.append('limit', String(filters.limit));

    const response = await api.get<{ success: boolean; data: Maintenance[]; total: number }>(
      `/maintenance/item/${itemId}?${params.toString()}`
    );
    return response.data;
  },

  getUpcomingMaintenances: async (days: number = 30) => {
    const response = await api.get<{ success: boolean; data: Maintenance[]; count: number }>(
      `/maintenance/upcoming?days=${days}`
    );
    return response.data;
  },

  getMaintenanceStatistics: async (itemId?: string) => {
    const params = new URLSearchParams();
    if (itemId) params.append('itemId', itemId);

    const response = await api.get<{ success: boolean; data: MaintenanceStatistics }>(
      `/maintenance/statistics?${params.toString()}`
    );
    return response.data;
  },
};
