import { z } from 'zod';

export const updateCompanyCpfCnpjSettingsSchema = z.object({
  token: z.string().optional(),
  cpfPackageId: z
    .string()
    .regex(/^\d+$/, 'CPF package id must be numeric')
    .optional()
    .or(z.literal('')),
  cnpjPackageId: z
    .string()
    .regex(/^\d+$/, 'CNPJ package id must be numeric')
    .optional()
    .or(z.literal('')),
});
