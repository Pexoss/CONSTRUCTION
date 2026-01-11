import { Rental } from './rental.types';
import { Customer } from './customer.types';

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'cancelled';

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Invoice {
  _id: string;
  companyId: string;
  invoiceNumber: string;
  rentalId?: string | Rental;
  customerId: string | Customer;
  items: InvoiceItem[];
  subtotal: number;
  tax?: number;
  discount?: number;
  total: number;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  paidDate?: string;
  terms?: string;
  notes?: string;
  pdfPath?: string;
  sentAt?: string;
  createdBy: string | { name: string; email: string };
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateInvoiceFromRentalData {
  rentalId: string;
  tax?: number;
  discount?: number;
  terms?: string;
  notes?: string;
}

export interface InvoiceFilters {
  status?: InvoiceStatus;
  customerId?: string;
  rentalId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}
