import { hasPermission, ROLES, RoleType } from "../shared/constants/roles";

// helpers de permissão
export const canApplyDiscount = (role: RoleType) => hasPermission(role, ROLES.ADMIN);
export const canEditAluguel = (role: RoleType) => hasPermission(role, ROLES.ADMIN);
export const canRequestChange = (role: RoleType) => !hasPermission(role, ROLES.ADMIN);
export const canApproveChange = (role: RoleType) => hasPermission(role, ROLES.ADMIN);

export const canDeleteCompany = (role: RoleType) =>
  hasPermission(role, ROLES.ADMIN) || hasPermission(role, ROLES.SUPERADMIN);

export const canUpdateRentalStatus = (role: RoleType) =>
  hasPermission(role, ROLES.ADMIN) || hasPermission(role, ROLES.SUPERADMIN);
