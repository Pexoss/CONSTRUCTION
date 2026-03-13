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
    const response = await api.post<{ success: boolean; data: { created: number } }>(
      `/rentals/${rentalId}/process-billing`
    );
    return response.data;
  },

  generateBillingPDF: async (id: string) => {
    const response = await api.get(`/billings/${id}/pdf`, {
      responseType: "blob",
    });
    return response.data;
  },
};
