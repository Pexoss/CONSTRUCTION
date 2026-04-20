export type FinancialStage = "pending" | "charge" | "invoiced" | "paid" | "cancelled";
export type FinancialGovernance = "charge" | "invoice";
export type PaymentOrigin = "billing" | "charge" | "invoice";

export interface FinancialPaymentEntry {
  amount: number;
  discount?: number;
  paidAt: Date;
  paymentMethod?: string;
  notes?: string;
  origin: PaymentOrigin;
  originId: string;
  createdBy?: string;
}

