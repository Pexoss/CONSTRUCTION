import { z } from 'zod';

export const createItemSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  category: z.string().min(1, 'Category is required'),
  subcategory: z.string().optional(),
  sku: z.string().min(1, 'SKU is required'),
  barcode: z.string().optional(),
  customId: z.string().optional(),
  photos: z.array(z.string().url()).optional().default([]),
  specifications: z.record(z.any()).optional(),
  quantity: z.object({
    total: z.number().int().min(0, 'Total quantity cannot be negative'),
    available: z.number().int().min(0).optional(),
    rented: z.number().int().min(0).optional(),
    maintenance: z.number().int().min(0).optional(),
    damaged: z.number().int().min(0).optional(),
  }),
  pricing: z.object({
    dailyRate: z.number().min(0, 'Daily rate cannot be negative'),
    weeklyRate: z.number().min(0).optional(),
    monthlyRate: z.number().min(0).optional(),
    depositAmount: z.number().min(0).optional(),
  }),
  location: z.string().optional(),
  depreciation: z
    .object({
      initialValue: z.number().min(0).optional(),
      currentValue: z.number().min(0).optional(),
      depreciationRate: z.number().min(0).max(100).optional(),
      purchaseDate: z.string().datetime().or(z.date()).optional(),
    })
    .optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  isActive: z.boolean().optional().default(true),
});

export const updateItemSchema = createItemSchema.partial();

export const createCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required'),
  description: z.string().optional(),
  isActive: z.boolean().optional().default(true),
});

export const updateCategorySchema = createCategorySchema.partial();

export const createSubcategorySchema = z.object({
  categoryId: z.string().min(1, 'Category ID is required'),
  name: z.string().min(1, 'Subcategory name is required'),
  description: z.string().optional(),
  isActive: z.boolean().optional().default(true),
});

export const updateSubcategorySchema = createSubcategorySchema.partial();

export const adjustQuantitySchema = z.object({
  type: z.enum(['in', 'out', 'adjustment', 'damage', 'repair']),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
  notes: z.string().optional(),
});
