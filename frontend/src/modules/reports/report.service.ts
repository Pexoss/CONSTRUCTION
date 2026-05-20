import api from "../../config/api";
import {
  RentalsReport,
  FinancialReport,
  InvoicesGeneratedReport,
  RentalItemsPeriodsReport,
  MostRentedItem,
  OccupancyRate,
  TopCustomer,
  MaintenanceReport,
  InventoryReport,
  ReceivablesReport,
} from "../../types/report.types";

export const reportService = {
  getRentalsReport: async (startDate: string, endDate: string) => {
    const response = await api.get<{ success: boolean; data: RentalsReport }>(
      `/reports/rentals?startDate=${startDate}&endDate=${endDate}`,
    );
    return response.data;
  },

  getFinancialReport: async (startDate: string, endDate: string) => {
    const response = await api.get<{ success: boolean; data: FinancialReport }>(
      `/reports/financial?startDate=${startDate}&endDate=${endDate}`,
    );
    return response.data;
  },

  getInvoicesGeneratedReport: async (startDate: string, endDate: string, billingIssuerId?: string) => {
    const params = new URLSearchParams();
    params.append("startDate", startDate);
    params.append("endDate", endDate);
    if (billingIssuerId?.trim()) params.append("billingIssuerId", billingIssuerId.trim());

    const response = await api.get<{
      success: boolean;
      data: InvoicesGeneratedReport;
    }>(`/reports/invoices-generated?${params.toString()}`);
    return response.data;
  },

  getRentalItemsPeriodsReport: async (startDate: string, endDate: string) => {
    const response = await api.get<{
      success: boolean;
      data: RentalItemsPeriodsReport;
    }>(
      `/reports/rental-items-periods?startDate=${startDate}&endDate=${endDate}`,
    );
    return response.data;
  },

  getMostRentedItems: async (
    startDate?: string,
    endDate?: string,
    limit: number = 10,
  ) => {
    const params = new URLSearchParams();
    if (startDate) params.append("startDate", startDate);
    if (endDate) params.append("endDate", endDate);
    params.append("limit", String(limit));

    const response = await api.get<{
      success: boolean;
      data: MostRentedItem[];
    }>(`/reports/most-rented-items?${params.toString()}`);
    return response.data;
  },

  getOccupancyRate: async (startDate: string, endDate: string) => {
    const response = await api.get<{ success: boolean; data: OccupancyRate[] }>(
      `/reports/occupancy-rate?startDate=${startDate}&endDate=${endDate}`,
    );
    return response.data;
  },

  getTopCustomers: async (
    startDate?: string,
    endDate?: string,
    limit: number = 10,
  ) => {
    const params = new URLSearchParams();
    if (startDate) params.append("startDate", startDate);
    if (endDate) params.append("endDate", endDate);
    params.append("limit", String(limit));

    const response = await api.get<{ success: boolean; data: TopCustomer[] }>(
      `/reports/top-customers?${params.toString()}`,
    );
    return response.data;
  },

  getMaintenanceReport: async (startDate: string, endDate: string) => {
    const response = await api.get<{
      success: boolean;
      data: MaintenanceReport;
    }>(`/reports/maintenance?startDate=${startDate}&endDate=${endDate}`);
    return response.data;
  },

  getInventoryReport: async () => {
    const response = await api.get<{ success: boolean; data: InventoryReport }>(
      `/reports/inventory`,
    );
    return response.data;
  },

  getReceivablesReport: async (startDate: string, endDate: string) => {
    const response = await api.get<{
      success: boolean;
      data: ReceivablesReport;
    }>(
      `/reports/receivables?startDate=${startDate}&endDate=${endDate}`,
    );
    return response.data;
  },

  getMostRentedInventory: async (limit: number = 5) => {
    const response = await api.get<{
      success: boolean;
      data: MostRentedItem[];
    }>(`/reports/inventory/most-rented?limit=${limit}`);
    return response.data;
  },

  exportRentalsReport: async (startDate: string, endDate: string) => {
    const response = await api.get(
      `/reports/rentals/export?startDate=${startDate}&endDate=${endDate}`,
      {
        responseType: "blob",
      },
    );
    return response.data;
  },

  exportFinancialReport: async (startDate: string, endDate: string) => {
    const response = await api.get(
      `/reports/financial/export?startDate=${startDate}&endDate=${endDate}`,
      {
        responseType: "blob",
      },
    );
    return response.data;
  },

  exportInvoicesGeneratedReport: async (
    startDate: string,
    endDate: string,
    billingIssuerId?: string,
  ) => {
    const params = new URLSearchParams();
    params.append("startDate", startDate);
    params.append("endDate", endDate);
    if (billingIssuerId?.trim()) params.append("billingIssuerId", billingIssuerId.trim());

    const response = await api.get(
      `/reports/invoices-generated/export?${params.toString()}`,
      {
        responseType: "blob",
      },
    );
    return response.data;
  },

  exportRentalItemsPeriodsReport: async (
    startDate: string,
    endDate: string,
  ) => {
    const response = await api.get(
      `/reports/rental-items-periods/export?startDate=${startDate}&endDate=${endDate}`,
      {
        responseType: "blob",
      },
    );
    return response.data;
  },
  exportMaintenanceReport: async (startDate: string, endDate: string) => {
    const response = await api.get(
      `/reports/maintenance/export?startDate=${startDate}&endDate=${endDate}`,
      {
        responseType: "blob",
      },
    );
    return response.data;
  },

  exportReceivablesReport: async (startDate: string, endDate: string) => {
    const response = await api.get(
      `/reports/receivables/export?startDate=${startDate}&endDate=${endDate}`,
      {
        responseType: "blob",
      },
    );
    return response.data;
  },

  exportReceivablesReportPdf: async (startDate: string, endDate: string) => {
    const response = await api.get(
      `/reports/receivables/export-pdf?startDate=${startDate}&endDate=${endDate}`,
      { responseType: "blob" },
    );
    return response.data;
  },

  exportRentalsReportPdf: async (startDate: string, endDate: string) => {
    const response = await api.get(
      `/reports/rentals/export-pdf?startDate=${startDate}&endDate=${endDate}`,
      { responseType: "blob" },
    );
    return response.data;
  },

  exportFinancialReportPdf: async (startDate: string, endDate: string) => {
    const response = await api.get(
      `/reports/financial/export-pdf?startDate=${startDate}&endDate=${endDate}`,
      { responseType: "blob" },
    );
    return response.data;
  },

  exportInvoicesGeneratedReportPdf: async (
    startDate: string,
    endDate: string,
    billingIssuerId?: string,
  ) => {
    const params = new URLSearchParams();
    params.append("startDate", startDate);
    params.append("endDate", endDate);
    if (billingIssuerId?.trim()) params.append("billingIssuerId", billingIssuerId.trim());

    const response = await api.get(
      `/reports/invoices-generated/export-pdf?${params.toString()}`,
      { responseType: "blob" },
    );
    return response.data;
  },

  exportRentalItemsPeriodsReportPdf: async (
    startDate: string,
    endDate: string,
  ) => {
    const response = await api.get(
      `/reports/rental-items-periods/export-pdf?startDate=${startDate}&endDate=${endDate}`,
      { responseType: "blob" },
    );
    return response.data;
  },

  exportMaintenanceReportPdf: async (startDate: string, endDate: string) => {
    const response = await api.get(
      `/reports/maintenance/export-pdf?startDate=${startDate}&endDate=${endDate}`,
      { responseType: "blob" },
    );
    return response.data;
  },

  exportInventoryReportPdf: async () => {
    const response = await api.get(`/reports/inventory/export-pdf`, {
      responseType: "blob",
    });
    return response.data;
  },

  exportInventoryReport: async () => {
    const response = await api.get(`/reports/inventory/export`, {
      responseType: "blob",
    });
    return response.data;
  },
};
