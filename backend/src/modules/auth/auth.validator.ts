import { z } from 'zod';
import { UserRole } from '../../shared/constants/roles';

export const registerCompanySchema = z.object({
  // Company data
  companyName: z.string().min(2, 'Company name must be at least 2 characters'),
  cnpj: z.string().regex(/^\d{14}$/, 'CNPJ must have exactly 14 digits').optional(),
  email: z.string().email('Invalid email format'),
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
  // First user (superadmin) data
  userName: z.string().min(2, 'Name must be at least 2 characters'),
  userEmail: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const registerUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.nativeEnum(UserRole).default(UserRole.VIEWER),
  companyCode: z.string().min(1, 'Company code is required'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
  companyCode: z.string().min(1, 'Company code is required'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});
