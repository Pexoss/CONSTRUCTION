import api from "../../config/api";

export interface ChargePayload {
  billingIds: string[];
  dueDate?: string;
  notes?: string;
  totalOverride?: number;
}

export interface ChargePaymentPayload {
  amount: number;
  discount?: number;
  paymentMethod?: string;
  notes?: string;
  paidAt?: string;
}

export const chargeService = {
  list: async () => {
    const response = await api.get<{ success: boolean; data: any[] }>("/charges");
    return response.data;
  },
  create: async (payload: ChargePayload) => {
    const response = await api.post<{ success: boolean; data: any }>("/charges", payload);
    return response.data;
  },
  pay: async (chargeId: string, payload: ChargePaymentPayload) => {
    const response = await api.post<{ success: boolean; data: any }>(`/charges/${chargeId}/payments`, payload);
    return response.data;
  },
  cancel: async (chargeId: string) => {
    const response = await api.post<{ success: boolean; data: any }>(`/charges/${chargeId}/cancel`);
    return response.data;
  },
  update: async (
    chargeId: string,
    payload: { dueDate?: string; notes?: string; total?: number; billingIds?: string[] }
  ) => {
    const response = await api.put<{ success: boolean; data: any }>(`/charges/${chargeId}`, payload);
    return response.data;
  },
  pdf: async (chargeId: string) => {
    const response = await api.get(`/charges/${chargeId}/pdf`, { responseType: "blob" });
    return response.data;
  },
};

