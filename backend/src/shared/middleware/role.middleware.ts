import { Request, Response, NextFunction } from 'express';
import { RoleType, UserRole } from '../constants/roles';

/**
 * Middleware to enforce role-based access control.
 */
export const requireRoles = (roles: RoleType[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
      return;
    }

    if (!roles.includes(user.role as RoleType)) {
      res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
      });
      return;
    }

    next();
  };
};

export const requireSuperAdmin = requireRoles([UserRole.SUPERADMIN]);