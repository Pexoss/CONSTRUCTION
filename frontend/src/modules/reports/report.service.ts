import api from '../../config/api';
import {
  RentalsReport,
  FinancialReport,
  MostRentedItem,
  OccupancyRate,
  TopCustomer,
  MaintenanceReport,
} from '../../types/report.types';

export const reportService = {
  getRentalsReport: async (startDate: string, endDate: string) => {
    const response = await api.get<{ success: boolean; data: RentalsReport }>(
      `/reports/rentals?startDate=${startDate}&endDate=${endDate}`
    );
    return response.data;
  },

  getFinancialReport: async (startDate: string, endDate: string) => {
    const response = await api.get<{ success: boolean; data: FinancialReport }>(
      `/reports/financial?startDate=${startDate}&endDate=${endDate}`
    );
    return response.data;
  },

  getMostRentedItems: async (startDate?: string, endDate?: string, limit: number = 10) => {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    params.append('limit', String(limit));

    const response = await api.get<{ success: boolean; data: MostRentedItem[] }>(
      `/reports/most-rented-items?${params.toString()}`
    );
    return response.data;
  },

  getOccupancyRate: async (startDate: string, endDate: string) => {
    const response = await api.get<{ success: boolean; data: OccupancyRate[] }>(
      `/reports/occupancy-rate?startDate=${startDate}&endDate=${endDate}`
    );
    return response.data;
  },

  getTopCustomers: async (startDate?: string, endDate?: string, limit: number = 10) => {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    params.append('limit', String(limit));

    const response = await api.get<{ success: boolean; data: TopCustomer[] }>(
      `/reports/top-customers?${params.toString()}`
    );
    return response.data;
  },

  getMaintenanceReport: async (startDate: string, endDate: string) => {
    const response = await api.get<{ success: boolean; data: MaintenanceReport }>(
      `/reports/maintenance?startDate=${startDate}&endDate=${endDate}`
    );
    return response.data;
  },

  exportRentalsReport: async (startDate: string, endDate: string) => {
    const response = await api.get(`/reports/rentals/export?startDate=${startDate}&endDate=${endDate}`, {
      responseType: 'blob',
    });
    return response.data;
  },

  exportFinancialReport: async (startDate: string, endDate: string) => {
    const response = await api.get(`/reports/financial/export?startDate=${startDate}&endDate=${endDate}`, {
      responseType: 'blob',
    });
    return response.data;
  },
};
