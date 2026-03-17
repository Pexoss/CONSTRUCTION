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

export interface BillingItem {
  itemId: string | { _id: string; name?: string };
  unitId?: string;
  quantity: number;
  unitPrice: number;
  periodsCharged: number;
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
  calculation: BillingCalculation;
  items?: BillingItem[];
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
