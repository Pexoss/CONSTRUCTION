import { z } from 'zod';

export const createItemSchema = z.object({
  name: z.string().min(1, { message: 'Nome é obrigatório' }),
  description: z.string().optional(),
  category: z.string().min(1, { message: 'Categoria é obrigatória' }),
  subcategory: z.string().optional(),
  sku: z.string().min(1, { message: 'SKU é obrigatório' }),
  barcode: z.string().optional(),
  customId: z.string().optional(),
  photos: z.array(z.string().url({ message: 'URL inválida' })).optional().default([]),
  specifications: z.record(z.string(), z.any()).optional(),
  quantity: z.object({
    total: z.number().int().min(0, { message: 'Quantidade total não pode ser negativa' }),
    available: z.number().int().min(0).optional(),
    rented: z.number().int().min(0).optional(),
    maintenance: z.number().int().min(0).optional(),
    damaged: z.number().int().min(0).optional(),
  }),
  pricing: z.object({
    dailyRate: z.number().min(0, { message: 'Taxa diária não pode ser negativa' }),
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
      purchaseDate: z.string().optional(),
    })
    .optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  isActive: z.boolean().optional().default(true),
});

export const updateItemSchema = createItemSchema.partial();

export const adjustQuantitySchema = z.object({
  type: z.string().refine(
    (val) => ['in', 'out', 'adjustment', 'damage', 'repair'].includes(val),
    { message: 'Tipo deve ser: in, out, adjustment, damage ou repair' }
  ),
  quantity: z.number().int().min(1, { message: 'Quantidade deve ser no mínimo 1' }),
  notes: z.string().optional(),
});

export const createCategorySchema = z.object({
  name: z.string().min(1, { message: 'Nome da categoria é obrigatório' }),
  description: z.string().optional(),
  isActive: z.boolean().optional().default(true),
});

export const createSubcategorySchema = z.object({
  categoryId: z.string().min(1, { message: 'ID da categoria é obrigatório' }),
  name: z.string().min(1, { message: 'Nome da subcategoria é obrigatório' }),
  description: z.string().optional(),
  isActive: z.boolean().optional().default(true),
});
