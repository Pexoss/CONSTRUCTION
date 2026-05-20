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
  billingIssuerId?: string;
  issuerCnpj?: string;
  issuerLabel?: string;
  billingIds?: string[];
  chargeIds?: string[];
  rentalId?: string | Rental;
  customerId: string | Customer;
  paymentMethod?: string;
  obraDescription?: string;
  items: InvoiceItem[];
  subtotal: number;
  tax?: number;
  discount?: number;
  total: number;
  status: InvoiceStatus;
  governsFinancialStatus?: boolean;
  issueDate: string;
  dueDate: string;
  paidDate?: string;
  terms?: string;
  notes?: string;
  pdfPath?: string;
  sentAt?: string;
  createdBy: string | { name: string; email: string };
  createdAt: string;
  updatedAt: string;
}

export interface CreateInvoiceFromRentalData {
  rentalId: string;
  billingIssuerId?: string;
  tax?: number;
  discount?: number;
  terms?: string;
  notes?: string;
}

export interface CreateInvoiceFromBillingsData {
  billingIds: string[];
  billingIssuerId?: string;
  tax?: number;
  discount?: number;
  terms?: string;
  notes?: string;
  paymentMethod?: string;
  obraDescription?: string;
  issueDate?: string;
  dueDate?: string;
}

export interface InvoiceFilters {
  status?: InvoiceStatus;
  customerId?: string;
  rentalId?: string;
  billingIssuerId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}
