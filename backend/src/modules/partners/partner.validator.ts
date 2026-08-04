import { z } from "zod";

export const createPartnerSchema = z.object({
  name: z.string().min(1, "Nome do parceiro é obrigatório"),
  phone: z.string().optional(),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  document: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().optional().default(true),
});

export const updatePartnerSchema = createPartnerSchema.partial();

export const returnPartnerLoanSchema = z.object({
  quantity: z.coerce.number().int().min(1).optional(),
});

export const partnerSupplyObjectSchema = z.object({
  partnerId: z.string().min(1, "Parceiro é obrigatório"),
  quantity: z.number().int().min(1, "Quantidade de terceiros deve ser ao menos 1"),
  agreedCost: z.number().min(0).optional(),
  notes: z.string().optional(),
});

export const partnerSupplySchema = z
  .union([partnerSupplyObjectSchema, z.null()])
  .optional();
