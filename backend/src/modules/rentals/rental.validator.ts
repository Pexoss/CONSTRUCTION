import { z } from 'zod';

export const createRentalSchema = z.object({
  customerId: z.string().min(1, 'Customer ID is required'),
  items: z
    .array(
      z.object({
        itemId: z.string().min(1, 'Item ID is required'),
        quantity: z.number().int().min(1, 'Quantity must be at least 1'),
      })
    )
    .min(1, 'At least one item is required'),
  dates: z.object({
    pickupScheduled: z.string().datetime().or(z.date()),
    returnScheduled: z.string().datetime().or(z.date()),
  }),
  pricing: z
    .object({
      discount: z.number().min(0).optional(),
    })
    .optional(),
  notes: z.string().optional(),
});

export const updateRentalSchema = z.object({
  notes: z.string().optional(),
  pricing: z
    .object({
      discount: z.number().min(0).optional(),
    })
    .optional(),
});

export const updateRentalStatusSchema = z.object({
  status: z.enum(['reserved', 'active', 'overdue', 'completed', 'cancelled']),
});

export const extendRentalSchema = z.object({
  newReturnDate: z.string().datetime().or(z.date()),
});

export const updateChecklistSchema = z.object({
  photos: z.array(z.string().url()).optional(),
  conditions: z.record(z.any()).optional(),
  notes: z.string().optional(),
});
