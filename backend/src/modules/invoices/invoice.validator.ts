import { z } from 'zod';

export const createInvoiceFromRentalSchema = z.object({
  rentalId: z.string().min(1, 'Rental ID is required'),
  tax: z.number().min(0).optional(),
  discount: z.number().min(0).optional(),
  terms: z.string().optional(),
  notes: z.string().optional(),
});

export const updateInvoiceSchema = z.object({
  status: z.enum(['draft', 'sent', 'paid', 'cancelled']).optional(),
  tax: z.number().min(0).optional(),
  discount: z.number().min(0).optional(),
  terms: z.string().optional(),
  notes: z.string().optional(),
  dueDate: z.string().datetime().or(z.date()).optional(),
});
