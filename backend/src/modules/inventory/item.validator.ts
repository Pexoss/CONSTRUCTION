import { z } from 'zod';

// Schema para unidade individual
const itemUnitSchema = z.object({
  unitId: z.string().min(1, { message: 'ID da unidade é obrigatório' }),
  status: z.enum(['available', 'reserved', 'rented', 'maintenance', 'damaged']),
  location: z.string().optional(),
  notes: z.string().optional(),
});

// Schema base (sem refine) para poder usar .partial()
const itemSchemaBase = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string().min(1),
  subcategory: z.string().optional(),
  sku: z.string().min(1),
  barcode: z.string().optional(),
  customId: z.string().optional(),

  trackingType: z.enum(['unit', 'quantity']),

  units: z.array(itemUnitSchema).optional(),

  quantity: z.object({
    total: z.number().int().min(0),
    available: z.number().int().min(0).optional(),
    reserved: z.number().int().min(0).optional(),
    rented: z.number().int().min(0).optional(),
    maintenance: z.number().int().min(0).optional(),
    damaged: z.number().int().min(0).optional(),
  }),

  photos: z.array(z.string().url()).optional().default([]),

  pricing: z.object({
    dailyRate: z.number().min(0),
    weeklyRate: z.number().min(0).optional(),
    biweeklyRate: z.number().min(0).optional(),
    monthlyRate: z.number().min(0).optional(),
    depositAmount: z.number().min(0).optional(),
  }),

  location: z.string().optional(),

  depreciation: z.object({
    initialValue: z.number().min(0).optional(),
    currentValue: z.number().min(0).optional(),
    depreciationRate: z.number().min(0).max(100).optional(),
    annualRate: z.number().min(0).max(100).optional(),
    accumulatedDepreciation: z.number().min(0).optional(),
    purchaseDate: z.string().datetime().or(z.date()).optional(),
    lastDepreciationDate: z.string().datetime().or(z.date()).optional(),
  }).optional(),

  lowStockThreshold: z.number().int().min(0).optional(),
  isActive: z.boolean().optional().default(true),
});


// Schema de criação com refine
export const createItemSchema = itemSchemaBase.refine((data) => {
  if (data.trackingType === 'unit') {
    return (
      (data.units && data.units.length > 0) ||
      !!data.customId
    );
  }

  // quantity
  return data.quantity.total > 0;
}, {
  message: 'Item unitário precisa de unidades ou customId',
  path: ['units'],
});

// Schema de atualização (partial, sem refine)
export const updateItemSchema = itemSchemaBase
  .omit({
    trackingType: true,
    units: true,
  })
  .partial();

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
