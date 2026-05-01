import { Request, Response, NextFunction } from 'express';
import { Company } from '../../modules/companies/company.model';
import { UserRole } from '../constants/roles';

/**
 * Middleware para identificar e validar tenant (empresa)
 */
export const tenantMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const headerCompanyId = req.headers['x-company-id'] as string | undefined;
    const userCompanyId = req.user?.companyId?.toString();
    const isSuperadmin = req.user?.role === UserRole.SUPERADMIN;

    if (headerCompanyId && userCompanyId && headerCompanyId !== userCompanyId && !isSuperadmin) {
      res.status(403).json({
        success: false,
        message: 'Company header does not match authenticated user company',
      });
      return;
    }

    const companyId = isSuperadmin && headerCompanyId
      ? headerCompanyId
      : userCompanyId || headerCompanyId;

    if (!companyId) {
      res.status(401).json({
        success: false,
        message: 'Company ID is required. Please provide X-Company-Id header.',
      });
      return;
    }

    const company = await Company.findById(companyId);

    if (!company) {
      res.status(401).json({
        success: false,
        message: 'Company not found',
      });
      return;
    }

    // Permitir acesso se a assinatura estiver ativa
    if (company.subscription.status !== 'active') {
      // DEBUG: vamos permitir que usuários “viewer” continuem acessando suas próprias aprovações
      if (req.user?.role !== 'viewer') {
        res.status(403).json({
          success: false,
          message: `Company subscription is ${company.subscription.status}`,
        });
        return;
      } else {
      }
    }

    // Injeta companyId no request
    req.companyId = companyId;

    next();
  } catch (error) {
    next(error);
  }
};
