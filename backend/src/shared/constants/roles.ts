export enum UserRole {
  SUPERADMIN = 'superadmin',
  ADMIN = 'admin',
  MANAGER = 'manager',
  OPERATOR = 'operator',
  VIEWER = 'viewer',
}

export const ROLES = {
  SUPERADMIN: UserRole.SUPERADMIN,
  ADMIN: UserRole.ADMIN,
  MANAGER: UserRole.MANAGER,
  OPERATOR: UserRole.OPERATOR,
  VIEWER: UserRole.VIEWER,
} as const;

export type RoleType = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_HIERARCHY: Record<RoleType, number> = {
  [UserRole.SUPERADMIN]: 5,
  [UserRole.ADMIN]: 4,
  [UserRole.MANAGER]: 3,
  [UserRole.OPERATOR]: 2,
  [UserRole.VIEWER]: 1,
};

export const hasPermission = (userRole: RoleType, requiredRole: RoleType): boolean => {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
};
