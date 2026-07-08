/** Administração financeira completa (criar cobrança, baixas, faturas, etc.). */
export const canManageFinancial = (role?: string | null): boolean =>
  role === "admin" || role === "superadmin";

/** Mesma regra do backend: admin/superadmin podem alugar sem CPF com confirmação. */
export const canBypassCustomerCpfAsAdmin = canManageFinancial;
