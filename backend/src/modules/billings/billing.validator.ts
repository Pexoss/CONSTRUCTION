import { z } from 'zod';

const dateOnlyOrDateTime = z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).or(z.date());

export const createBillingSchema = z.object({
  rentalId: z.string().min(1, 'Rental ID is required'),
  returnDate: dateOnlyOrDateTime,
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
  paymentDate: dateOnlyOrDateTime.optional(),
  amount: z.number().positive().optional(),
  discount: z.number().min(0).optional(),
  discountReason: z.string().optional(),
});

export const getBillingsSchema = z.object({
  rentalId: z.string().optional(),
  customerId: z.string().optional(),
  status: z.enum(['draft', 'pending_approval', 'approved', 'paid', 'cancelled']).optional(),
  startDate: dateOnlyOrDateTime.optional(),
  endDate: dateOnlyOrDateTime.optional(),
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
});

export const updateBillingSchema = z.object({
  periodStart: dateOnlyOrDateTime.optional(),
  periodEnd: dateOnlyOrDateTime.optional(),
  notes: z.string().optional(),
  discount: z.number().min(0).optional(),
  discountReason: z.string().optional(),
});
