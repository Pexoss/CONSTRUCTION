import { z } from 'zod';

export const createMaintenanceSchema = z.object({
  itemId: z.string().min(1, 'Item ID is required'),
  type: z.enum(['preventive', 'corrective'], {
    required_error: 'Maintenance type is required',
    invalid_type_error: 'Type must be preventive or corrective',
  }),
  status: z.enum(['scheduled', 'in_progress', 'completed']).optional().default('scheduled'),
  scheduledDate: z.string().datetime().or(z.date()),
  completedDate: z.string().datetime().or(z.date()).optional(),
  description: z.string().min(1, 'Description is required'),
  cost: z.number().min(0, 'Cost cannot be negative').default(0),
  performedBy: z.string().optional(),
  notes: z.string().optional(),
  attachments: z.array(z.string().url()).optional().default([]),
});

export const updateMaintenanceSchema = createMaintenanceSchema.partial();

export const updateMaintenanceStatusSchema = z.object({
  status: z.enum(['scheduled', 'in_progress', 'completed']),
  completedDate: z.string().datetime().or(z.date()).optional(),
  performedBy: z.string().optional(),
  notes: z.string().optional(),
});
