import { z } from 'zod';

export const invoiceIssuerPutItemSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1, 'Nome do emissor é obrigatório').max(120),
  cnpj: z.string().min(14, 'CNPJ inválido'),
  initialInvoiceNumber: z.number().int().min(1).max(999_999_999).optional(),
});

export const updateCompanyInvoiceIssuersSchema = z.object({
  issuers: z.array(invoiceIssuerPutItemSchema),
});

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
