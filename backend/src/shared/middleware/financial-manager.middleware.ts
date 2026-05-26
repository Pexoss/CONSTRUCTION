import { requireRoles } from "./role.middleware";
import { UserRole } from "../constants/roles";

/** Criar/editar cobranças, fechamentos e faturas (PDF e leitura liberados para demais perfis). */
export const requireFinancialManager = requireRoles([
  UserRole.ADMIN,
  UserRole.SUPERADMIN,
]);
