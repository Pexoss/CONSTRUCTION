import { Item } from './inventory.types';
import { Customer } from './customer.types';

export type RentalStatus = 'reserved' | 'active' | 'overdue' | 'completed' | 'cancelled';

export interface RentalItem {
  itemId: string | Item;
  unitId?: string;
  quantity: number;
  unitPrice: number;
  rentalType?: 'daily' | 'weekly' | 'biweekly' | 'monthly';
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
