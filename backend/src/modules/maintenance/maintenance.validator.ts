import { z } from 'zod';

export const createMaintenanceSchema = z.object({
  itemId: z.string().min(1, 'Item ID is required'),
  unitId: z.string().optional(),
  type: z.enum(['preventive', 'corrective'], {
    required_error: 'Maintenance type is required',
    invalid_type_error: 'Type must be preventive or corrective',
  }),
  status: z.enum(['scheduled', 'in_progress', 'completed']).optional().default('scheduled'),
  scheduledDate: z.coerce.date(),
  expectedReturnDate: z.coerce.date().optional(),
  completedDate: z.coerce.date().optional(),
  description: z.string().min(1, 'Description is required'),
  cost: z.coerce.number().min(0).default(0),
  itemUnavailable: z.coerce.boolean().optional(),
  performedBy: z.string().optional(),
  notes: z.string().optional(),
  attachments: z.array(z.string()).default([]),
});

export const updateMaintenanceSchema = createMaintenanceSchema.partial();

export const updateMaintenanceStatusSchema = z.object({
  status: z.enum(['scheduled', 'in_progress', 'completed']),
  completedDate: z.coerce.date().optional(),
  performedBy: z.string().optional(),
  notes: z.string().optional(),
});

