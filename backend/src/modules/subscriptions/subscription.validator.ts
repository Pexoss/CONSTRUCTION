import { z } from 'zod';

export const createPaymentSchema = z.object({
  amount: z.number().min(0, 'Amount cannot be negative'),
  plan: z.enum(['basic', 'pro', 'enterprise']),
  dueDate: z.string().datetime().or(z.date()),
  paymentMethod: z.string().optional(),
  notes: z.string().optional(),
});

export const markPaymentAsPaidSchema = z.object({
  paidDate: z.string().datetime().or(z.date()).optional(),
  paymentMethod: z.string().optional(),
  notes: z.string().optional(),
});
