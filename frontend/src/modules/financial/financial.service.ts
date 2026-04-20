import api from "../../config/api";

export const financialService = {
  getBoard: async (params?: {
    customerId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value) query.append(key, value);
    });
    const response = await api.get<{ success: boolean; data: any }>(`/financial/board?${query.toString()}`);
    return response.data;
  },
  getDashboard: async () => {
    const response = await api.get<{ success: boolean; data: any }>("/financial/dashboard");
    return response.data;
  },
};

