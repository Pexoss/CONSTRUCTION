import { Item } from './inventory.types';
import { Customer } from './customer.types';

export type RentalStatus = 'reserved' | 'active' | 'overdue' | 'completed' | 'cancelled';
export type BillingCycle = 'daily' | 'weekly' | 'biweekly' | 'monthly';

// O que o usuário vê na UI
export type RentalTypeUI =
  | 'diario'
  | 'semanal'
  | 'quinzenal'
  | 'mensal';

// O que o backend espera
export type RentalTypeAPI =
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'monthly';

export interface RentalItem {
  itemId: string | Item;
  unitId?: string;
  quantity: number;
  unitPrice: number;
  rentalType?: RentalTypeUI;
  subtotal: number;
}

export interface RentalDates {
  reservedAt: string;
  pickupScheduled: string;
  pickupActual?: string;
  returnScheduled: string;
  returnActual?: string;
  billingCycle?: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  lastBillingDate?: string;
  nextBillingDate?: string;
}

export interface RentalPricing {
  equipmentSubtotal: number;
  servicesSubtotal: number;
  subtotal: number;
  deposit: number;
  discount: number;
  discountReason?: string;
  discountApprovedBy?: string;
  lateFee: number;
  total: number;
}

export interface RentalChecklist {
  photos?: string[];
  conditions?: Record<string, any>;
  notes?: string;
  completedAt?: string;
  completedBy?: string | { name: string; email: string };
}

export interface RentalService {
  description: string;
  price: number;
  quantity: number;
  subtotal: number;
  category: string;
  notes?: string;
}

export interface RentalWorkAddress {
  street: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city: string;
  state: string;
  zipCode: string;
  workName: string;
  workId?: string;
}

export type RentalStatusChangeApproval =
  | {
    hasPending: false;
  }
  | {
    hasPending: true;
    request: {
      id: string;
      fromStatus: string;
      toStatus: string;
      requestedBy: {
        name: string;
      };
      createdAt: string;
    };
  };

export interface UpdateRentalStatusResponse {
  rental: Rental;
  requiresApproval?: boolean;
  message?: string;
}


export interface Rental {
  _id: string;
  companyId: string;
  rentalNumber: string;
  customerId: string | Customer;
  items: RentalItem[];
  services?: RentalService[];
  workAddress?: RentalWorkAddress;
  dates: RentalDates;
  pricing: RentalPricing;
  status: RentalStatus;
  notes?: string;
  checklistPickup?: RentalChecklist;
  checklistReturn?: RentalChecklist;
  createdBy: string | { name: string; email: string };
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateRentalData {
  customerId: string;
  items: {
    itemId: string;
    unitId?: string;
    quantity: number;
    rentalType?: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  }[];
  services?: RentalService[];
  workAddress?: RentalWorkAddress;
  dates: {
    pickupScheduled: string;
    returnScheduled: string;
  };
  pricing?: {
    discount?: number;
  };
  notes?: string;
}

export interface RentalFilters {
  status?: RentalStatus;
  customerId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface UpdateRentalStatusData {
  status: RentalStatus;
}

export interface ExtendRentalData {
  newReturnDate: string;
}

export interface ChecklistData {
  photos?: string[];
  conditions?: Record<string, any>;
  notes?: string;
}

export interface RentalDashboardItem {
  _id: string;
  rentalNumber?: string;
  status: string;
  customerId: | string | { name: string; cpfCnpj?: string; };
  dates: {
    returnScheduled?: string;
    nextBillingDate?: string;
    billingCycle?: BillingCycle;
  };
  pricing: {
    total: number;
  };
}
