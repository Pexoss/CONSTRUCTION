/** Administração financeira completa (criar cobrança, baixas, faturas, etc.). */
export const canManageFinancial = (role?: string | null): boolean =>
  role === "admin" || role === "superadmin";
