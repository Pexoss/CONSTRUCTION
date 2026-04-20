import api from "../../config/api";
import { Billing, BillingFilters } from "../../types/billing.types";

export const billingService = {
  getBillings: async (filters: BillingFilters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        params.append(key, String(value));
      }
    });

    const response = await api.get<{
      success: boolean;
      data: { billings: Billing[]; total: number; page: number; limit: number };
    }>(`/billings?${params.toString()}`);

    return response.data;
  },

  processRentalBilling: async (rentalId: string) => {
    const response = await api.post<{
      success: boolean;
      data: {
        created: number;
        draftsCreated: number;
        skipReason?: "rental_not_active";
      };
    }>(`/rentals/${rentalId}/process-billing`);
    return response.data;
  },

  generateBillingPDF: async (id: string) => {
    const response = await api.get(`/billings/${id}/pdf`, {
      responseType: "blob",
    });
    return response.data;
  },
  markAsPaid: async (
    id: string,
    data: {
      paymentMethod: string;
      paymentDate?: string;
      amount?: number;
      discount?: number;
      discountReason?: string;
    }
  ) => {
    const response = await api.post<{ success: boolean; data: Billing }>(
      `/billings/${id}/mark-as-paid`,
      data
    );
    return response.data;
  },
  updateBilling: async (
    id: string,
    data: {
      periodStart?: string;
      periodEnd?: string;
      notes?: string;
      discount?: number;
      discountReason?: string;
    }
  ) => {
    const response = await api.put<{ success: boolean; data: Billing }>(`/billings/${id}`, data);
    return response.data;
  },
  cancelBilling: async (id: string) => {
    const response = await api.post<{ success: boolean; data: Billing }>(`/billings/${id}/cancel`);
    return response.data;
  },
  refreshBilling: async (id: string) => {
    const response = await api.post<{ success: boolean; data: Billing }>(`/billings/${id}/refresh`);
    return response.data;
  },
  previewRefreshBilling: async (id: string) => {
    const response = await api.get<{
      success: boolean;
      data: {
        billingId: string;
        billingNumber: string;
        customerName: string;
        current: { total: number; outstandingAmount: number };
        next: { total: number; outstandingAmount: number };
        diff: { total: number; outstandingAmount: number };
      };
    }>(`/billings/${id}/refresh-preview`);
    return response.data;
  },

  syncMissingRentals: async () => {
    const response = await api.post<{
      success: boolean;
      data: {
        rentalsProcessed: number;
        created: number;
        draftsCreated: number;
        refreshed: number;
      };
    }>("/billings/sync-missing-rentals");
    return response.data;
  },
};
