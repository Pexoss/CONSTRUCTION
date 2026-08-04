import api from "../../config/api";
import {
  CreatePartnerData,
  Partner,
  PartnerLoan,
  PartnerLoanStatus,
  PartnerLoanSummary,
} from "../../types/partner.types";

export const partnerService = {
  getPartners: async (filters: {
    search?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  } = {}) => {
    const params = new URLSearchParams();
    if (filters.search) params.append("search", filters.search);
    if (typeof filters.isActive === "boolean") {
      params.append("isActive", String(filters.isActive));
    }
    if (filters.page) params.append("page", String(filters.page));
    if (filters.limit) params.append("limit", String(filters.limit));
    const response = await api.get<{
      success: boolean;
      data: Partner[];
      pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      };
    }>(`/partners?${params.toString()}`);
    return response.data;
  },

  getPartnerById: async (id: string) => {
    const response = await api.get<{ success: boolean; data: Partner }>(
      `/partners/${id}`,
    );
    return response.data;
  },

  createPartner: async (data: CreatePartnerData) => {
    const response = await api.post<{
      success: boolean;
      message: string;
      data: Partner;
    }>("/partners", data);
    return response.data;
  },

  updatePartner: async (id: string, data: Partial<CreatePartnerData>) => {
    const response = await api.put<{
      success: boolean;
      message: string;
      data: Partner;
    }>(`/partners/${id}`, data);
    return response.data;
  },

  deletePartner: async (id: string) => {
    const response = await api.delete<{ success: boolean; message: string }>(
      `/partners/${id}`,
    );
    return response.data;
  },

  getLoans: async (filters: {
    partnerId?: string;
    status?: PartnerLoanStatus;
    rentalId?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  } = {}) => {
    const params = new URLSearchParams();
    if (filters.partnerId) params.append("partnerId", filters.partnerId);
    if (filters.status) params.append("status", filters.status);
    if (filters.rentalId) params.append("rentalId", filters.rentalId);
    if (filters.startDate) params.append("startDate", filters.startDate);
    if (filters.endDate) params.append("endDate", filters.endDate);
    if (filters.page) params.append("page", String(filters.page));
    if (filters.limit) params.append("limit", String(filters.limit));
    const response = await api.get<{
      success: boolean;
      data: PartnerLoan[];
      summary: PartnerLoanSummary;
      pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      };
    }>(`/partners/loans?${params.toString()}`);
    return response.data;
  },

  returnLoanToPartner: async (loanId: string, quantity?: number) => {
    const response = await api.post<{
      success: boolean;
      message: string;
      data: PartnerLoan;
    }>(`/partners/loans/${loanId}/return`, quantity != null ? { quantity } : {});
    return response.data;
  },
};
