import { z } from "zod";

const customerBaseSchema = z.object({
  name: z.string().min(1, "Name is required").optional(),
  cpfCnpj: z.string().optional().nullable().or(z.literal("")),
  validateDocument: z.boolean().optional().default(false),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  addresses: z
    .array(
      z.object({
        addressName: z.string().optional(),
        type: z.enum(["main", "billing", "work", "other"]).optional().default("main"),
        street: z.string().optional(),
        number: z.string().optional(),
        complement: z.string().optional(),
        neighborhood: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        zipCode: z.string().optional(),
        country: z.string().optional(),
        isDefault: z.boolean().optional(),
        notes: z.string().optional(),
        _id: z.string().optional(),
      }),
    )
    .optional(),
  notes: z.string().optional(),
  isBlocked: z.boolean().optional().default(false),
});

export const createCustomerSchema = customerBaseSchema.superRefine(
  (data, ctx) => {
    if (
      !data.validateDocument &&
      (!data.name || data.name.trim().length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["name"],
        message: "Name is required",
      });
    }
  },
);

export const updateCustomerSchema = customerBaseSchema.partial();

export const validateCustomerDocumentSchema = z.object({
  cpfCnpj: z.string().optional().nullable().or(z.literal('')),
});
