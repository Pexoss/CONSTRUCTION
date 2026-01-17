import { z } from 'zod';

export const createBillingSchema = z.object({
  rentalId: z.string().min(1, 'Rental ID is required'),
  returnDate: z.string().datetime().or(z.date()),
  discount: z.number().min(0).optional(),
  discountReason: z.string().optional(),
});

export const approveBillingSchema = z.object({
  notes: z.string().optional(),
});

export const rejectBillingSchema = z.object({
  notes: z.string().min(1, 'Rejection notes are required'),
});

export const markAsPaidSchema = z.object({
  paymentMethod: z.string().min(1, 'Payment method is required'),
  paymentDate: z.string().datetime().or(z.date()).optional(),
});

export const getBillingsSchema = z.object({
  rentalId: z.string().optional(),
  customerId: z.string().optional(),
  status: z.enum(['draft', 'pending_approval', 'approved', 'paid', 'cancelled']).optional(),
  startDate: z.string().datetime().or(z.date()).optional(),
  endDate: z.string().datetime().or(z.date()).optional(),
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
});
