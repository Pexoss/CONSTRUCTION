import { z } from 'zod';

export const createTransactionSchema = z.object({
  type: z.enum(['income', 'expense'], {
    required_error: 'Transaction type is required',
    invalid_type_error: 'Type must be income or expense',
  }),
  category: z.string().min(1, 'Category is required'),
  amount: z.number().min(0, 'Amount cannot be negative'),
  description: z.string().min(1, 'Description is required'),
  relatedTo: z
    .object({
      type: z.enum(['rental', 'maintenance', 'other']),
      id: z.string().min(1, 'Related ID is required'),
    })
    .optional(),
  paymentMethod: z.string().optional(),
  status: z.enum(['pending', 'paid', 'overdue', 'cancelled']).optional().default('pending'),
  dueDate: z.string().datetime().or(z.date()).optional(),
  paidDate: z.string().datetime().or(z.date()).optional(),
});

export const updateTransactionSchema = createTransactionSchema.partial();
