export type BillingStatus = 'draft' | 'pending_approval' | 'approved' | 'paid' | 'cancelled';
export type RentalType = 'daily' | 'weekly' | 'biweekly' | 'monthly';
export type FinancialStage = 'pending' | 'charge' | 'invoiced' | 'paid' | 'cancelled';
export type FinancialGovernance = 'charge' | 'invoice';

export interface BillingCalculation {
  periodsCompleted: number;
  extraDays: number;
  chargeExtraPeriod: boolean;
  baseAmount: number;
  servicesAmount: number;
  subtotal: number;
  discount: number;
  total: number;
  discountReason?: string;
}

export interface BillingItem {
  itemId: string | { _id: string; name?: string };
  unitId?: string;
  rentalLineKey?: string;
  quantity: number;
  unitPrice: number;
  periodsCharged: number;
  subtotal: number;
}

export interface BillingService {
  description: string;
  category?: string;
  price: number;
  quantity: number;
  subtotal: number;
}

export interface Billing {
  _id: string;
  rentalId: string | { _id: string; rentalNumber?: string };
  customerId: string | { _id: string; name?: string };
  billingNumber: string;
  billingDate: string;
  periodStart: string;
  periodEnd: string;
  rentalType: RentalType;
  intervalChargeMode?: 'floored' | 'proportional';
  calculation: BillingCalculation;
  items?: BillingItem[];
  services?: BillingService[];
  status: BillingStatus;
  financialStage?: FinancialStage;
  governance?: FinancialGovernance;
  chargeId?: string;
  invoiceId?: string;
  outstandingAmount?: number;
  paymentDate?: string;
  paymentMethod?: string;
  notes?: string;
}

export interface BillingFilters {
  rentalId?: string;
  customerId?: string;
  status?: BillingStatus;
  startDate?: string;
  endDate?: string;
  onlyOverdue?: boolean;
  page?: number;
  limit?: number;
}
