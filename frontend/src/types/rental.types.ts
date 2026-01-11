import { Item } from './inventory.types';
import { Customer } from './customer.types';

export type RentalStatus = 'reserved' | 'active' | 'overdue' | 'completed' | 'cancelled';

export interface RentalItem {
  itemId: string | Item;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface RentalDates {
  reservedAt: string;
  pickupScheduled: string;
  pickupActual?: string;
  returnScheduled: string;
  returnActual?: string;
}

export interface RentalPricing {
  subtotal: number;
  deposit: number;
  discount: number;
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

export interface Rental {
  _id: string;
  companyId: string;
  rentalNumber: string;
  customerId: string | Customer;
  items: RentalItem[];
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
    quantity: number;
  }[];
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
