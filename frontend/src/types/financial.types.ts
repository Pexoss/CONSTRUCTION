export type FinancialStage = "pending" | "charge" | "invoiced" | "paid" | "cancelled";
export type FinancialGovernance = "charge" | "invoice";

export interface FinancialSummaryCard {
  id: string;
  sourceType: "billing" | "charge" | "invoice";
  customerName: string;
  stage: FinancialStage;
  governance: FinancialGovernance;
  total: number;
  outstandingAmount: number;
  dueDate?: string;
  issueDate?: string;
  referenceNumber: string;
}

