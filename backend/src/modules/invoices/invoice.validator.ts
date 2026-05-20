import { z } from 'zod';

const dateOnlyOrDateTime = z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).or(z.date());

export const createInvoiceFromRentalSchema = z.object({
  rentalId: z.string().min(1, 'Rental ID is required'),
  billingIssuerId: z.string().min(1).optional(),
  tax: z.number().min(0).optional(),
  discount: z.number().min(0).optional(),
  terms: z.string().optional(),
  notes: z.string().optional(),
});

export const createInvoiceFromBillingsSchema = z.object({
  billingIds: z.array(z.string().min(1)).min(1, 'Selecione ao menos um fechamento'),
  billingIssuerId: z.string().min(1).optional(),
  tax: z.number().min(0).optional(),
  discount: z.number().min(0).optional(),
  terms: z.string().optional(),
  notes: z.string().optional(),
  paymentMethod: z.string().optional(),
  obraDescription: z.string().optional(),
  issueDate: dateOnlyOrDateTime.optional(),
  dueDate: dateOnlyOrDateTime.optional(),
});

export const updateInvoiceSchema = z.object({
  status: z.enum(['draft', 'sent', 'paid', 'cancelled']).optional(),
  tax: z.number().min(0).optional(),
  discount: z.number().min(0).optional(),
  terms: z.string().optional(),
  notes: z.string().optional(),
  dueDate: dateOnlyOrDateTime.optional(),
});
