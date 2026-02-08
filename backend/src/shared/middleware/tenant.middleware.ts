import { Request, Response, NextFunction } from 'express';
import { Company } from '../../modules/companies/company.model';

/**
 * Middleware para identificar e validar tenant (empresa)
 */
export const tenantMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Prioridade 1: Header X-Company-Id
    let companyId = req.headers['x-company-id'] as string;

    // Prioridade 2: do usuário autenticado
    if (!companyId && req.user?.companyId) {
      companyId = req.user.companyId.toString();
    }

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
