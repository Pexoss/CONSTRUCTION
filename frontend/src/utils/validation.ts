import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha é obrigatória'),
  companyCode: z.string().min(1, 'O Código é obrigatório'),
});

export const registerCompanySchema = z.object({
  companyName: z.string().min(2, 'Nome da empresa deve ter pelo menos 2 caracteres'),
  cnpj: z.string().regex(/^\d{14}$/, 'CNPJ deve ter exatamente 14 dígitos'),
  email: z.string().email('Email inválido'),
  phone: z.string().optional(),
  address: z
    .object({
      street: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zipCode: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
  userName: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  userEmail: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
});
