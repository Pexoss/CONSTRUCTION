export type BillingStatus = 'draft' | 'pending_approval' | 'approved' | 'paid' | 'cancelled';
export type RentalType = 'daily' | 'weekly' | 'biweekly' | 'monthly';

export interface BillingCalculation {
  periodsCompleted: number;
  extraDays: number;
  chargeExtraPeriod: boolean;
  baseAmount: number;
  servicesAmount: number;
  subtotal: number;
  discount: number;
  total: number;
}

export interface Billing {
  _id: string;
  rentalId: string;
  customerId: string;
  billingNumber: string;
  billingDate: string;
  periodStart: string;
  periodEnd: string;
  rentalType: RentalType;
  calculation: BillingCalculation;
  status: BillingStatus;
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
  page?: number;
  limit?: number;
}
