import { Document } from 'mongoose';
import mongoose from 'mongoose';

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'cancelled';

export interface IInvoice extends Document {
  companyId: mongoose.Types.ObjectId;
  invoiceNumber: string;
  /** Fechamentos (billings) agrupados nesta fatura, quando criada a partir de fechamentos */
  billingIds?: mongoose.Types.ObjectId[];
  rentalId?: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  /** Forma de pagamento exibida na fatura (ex.: boleto/PIX) */
  paymentMethod?: string;
  /** Endereço da obra / local de uso (texto livre) */
  obraDescription?: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  subtotal: number;
  tax?: number;
  discount?: number;
  total: number;
  status: InvoiceStatus;
  issueDate: Date;
  dueDate: Date;
  paidDate?: Date;
  terms?: string;
  notes?: string;
  pdfPath?: string;
  sentAt?: Date;
  createdBy: mongoose.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}
