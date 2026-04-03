import { z } from 'zod';

export const createInvoiceFromRentalSchema = z.object({
  rentalId: z.string().min(1, 'Rental ID is required'),
  tax: z.number().min(0).optional(),
  discount: z.number().min(0).optional(),
  terms: z.string().optional(),
  notes: z.string().optional(),
});

export const createInvoiceFromBillingsSchema = z.object({
  billingIds: z.array(z.string().min(1)).min(1, 'Selecione ao menos um fechamento'),
  tax: z.number().min(0).optional(),
  discount: z.number().min(0).optional(),
  terms: z.string().optional(),
  notes: z.string().optional(),
  paymentMethod: z.string().optional(),
  obraDescription: z.string().optional(),
  issueDate: z.string().datetime().or(z.date()).optional(),
  dueDate: z.string().datetime().or(z.date()).optional(),
});

export const updateInvoiceSchema = z.object({
  status: z.enum(['draft', 'sent', 'paid', 'cancelled']).optional(),
  tax: z.number().min(0).optional(),
  discount: z.number().min(0).optional(),
  terms: z.string().optional(),
  notes: z.string().optional(),
  dueDate: z.string().datetime().or(z.date()).optional(),
});
