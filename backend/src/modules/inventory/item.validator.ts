import { z } from 'zod';

// Schema para unidade individual
const itemUnitSchema = z.object({
  unitId: z.string().min(1, 'Unit ID is required'),
  status: z.enum(['available', 'rented', 'maintenance', 'damaged']),
  currentRental: z.string().optional(),
  currentCustomer: z.string().optional(),
  maintenanceDetails: z.object({
    expectedReturnDate: z.string().datetime().or(z.date()).optional(),
    cost: z.number().min(0).optional(),
    supplier: z.string().optional(),
  }).optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
});

// Schema base (sem refine) para poder usar .partial()
const itemSchemaBase = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  category: z.string().min(1, 'Category is required'),
  subcategory: z.string().optional(),
  sku: z.string().min(1, 'SKU is required'),
  barcode: z.string().optional(),
  customId: z.string().optional(),

  // NOVO: Tipo de controle
  trackingType: z.enum(['unit', 'quantity']).default('quantity'),

  // NOVO: Array de unidades (para tipo unitário)
  units: z.array(itemUnitSchema).optional(),

  // Quantidade (para tipo quantitativo ou calculada para unitário)
  quantity: z.object({
    total: z.number().int().min(0, 'Total quantity cannot be negative'),
    available: z.number().int().min(0).optional(),
    rented: z.number().int().min(0).optional(),
    maintenance: z.number().int().min(0).optional(),
    damaged: z.number().int().min(0).optional(),
  }),

  photos: z.array(z.string().url()).optional().default([]),
  specifications: z.record(z.any()).optional(),
  pricing: z.object({
    dailyRate: z.number().min(0, 'Daily rate cannot be negative'),
    weeklyRate: z.number().min(0).optional(),
    biweeklyRate: z.number().min(0).optional(), // NOVO
    monthlyRate: z.number().min(0).optional(),
    depositAmount: z.number().min(0).optional(),
  }),
  location: z.string().optional(),
  depreciation: z
    .object({
      initialValue: z.number().min(0).optional(),
      currentValue: z.number().min(0).optional(),
      depreciationRate: z.number().min(0).max(100).optional(),
      annualRate: z.number().min(0).max(100).optional(), // NOVO
      accumulatedDepreciation: z.number().min(0).optional(), // NOVO
      purchaseDate: z.string().datetime().or(z.date()).optional(),
      lastDepreciationDate: z.string().datetime().or(z.date()).optional(),
    })
    .optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  isActive: z.boolean().optional().default(true),
});

// Schema de criação com refine
export const createItemSchema = itemSchemaBase.refine((data) => {
  if (data.trackingType === 'unit') {
    // Se units estiver vazio, podemos criar uma unidade a partir do customId
    return data.units && data.units.length > 0 || !!data.customId;
  }
  return true;
}, {
  message: 'Items with unit tracking type must have at least one unit or customId',
  path: ['units'],
});


// Schema de atualização (partial, sem refine)
export const updateItemSchema = itemSchemaBase.partial();

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
