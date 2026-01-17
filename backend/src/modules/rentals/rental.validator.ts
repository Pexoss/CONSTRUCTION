import { z } from 'zod';

export const createRentalSchema = z.object({
  customerId: z.string().min(1, 'Customer ID is required'),
  items: z
    .array(
      z.object({
        itemId: z.string().min(1, 'Item ID is required'),
        unitId: z.string().optional(), // unitário opcional
        quantity: z.number().int().min(1, 'Quantity must be at least 1'),
        rentalType: z.enum(['daily', 'weekly', 'biweekly', 'monthly']).optional(), // opcional
      })
    )
    .min(1, 'At least one item is required'),
  services: z
    .array(
      z.object({
        description: z.string(),
        price: z.number(),
        quantity: z.number().optional(),
        category: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .optional(),
  dates: z.object({
    pickupScheduled: z.string().datetime().or(z.date()),
    returnScheduled: z.string().datetime().or(z.date()),
    billingCycle: z.enum(['daily', 'weekly', 'biweekly', 'monthly']).optional(),
    lastBillingDate: z.string().datetime().or(z.date()).optional(),
    nextBillingDate: z.string().datetime().or(z.date()).optional(),
  }),
  workAddress: z
    .object({
      street: z.string(),
      number: z.string(),
      complement: z.string().optional(),
      neighborhood: z.string(),
      city: z.string(),
      state: z.string(),
      zipCode: z.string(),
      workName: z.string(),
      workId: z.string().optional(),
    })
    .optional(),
  pricing: z
    .object({
      discount: z.number().min(0).optional(),
      discountReason: z.string().optional(),
      discountApprovedBy: z.string().optional(),
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
