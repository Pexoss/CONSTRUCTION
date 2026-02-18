export type PaymentStatus = 'pending' | 'paid' | 'overdue';
export type SubscriptionPlan = 'basic' | 'pro' | 'enterprise';


export interface SubscriptionPayment {
  _id: string;
  companyId: string;
  amount: number;
  plan: SubscriptionPlan;
  dueDate: string;
  paidDate?: string;
  status: PaymentStatus;
  paymentMethod?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreatePaymentData {
  companyId: string;
  amount: number;
  plan: SubscriptionPlan;
  dueDate: string;
  paymentMethod?: string;
  notes?: string;
}

export interface CompanyMetrics {
  totalRentals: number;
  activeRentals: number;
  totalTransactions: number;
  totalMaintenances: number;
  totalItems: number;
  totalCustomers: number;
  revenue: number;
  expenses: number;
}

export interface Company {
  _id: string;
  name: string;
  cnpj: string;
  email: string;
  phone?: string;
  cpfCnpjTokenConfigured?: boolean;
  subscription: {
    plan: SubscriptionPlan;
    status: 'active' | 'suspended' | 'cancelled';
    paymentDueDate?: string;
    lastPaymentDate?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}
