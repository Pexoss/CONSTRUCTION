import { Request, Response, NextFunction } from 'express';
import { Company } from '../../modules/companies/company.model';

/**
 * Middleware to identify and validate tenant (company)
 * For now, uses X-Company-Id header. Future: subdomain-based identification
 */
export const tenantMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Priority 1: Header (for development/testing)
    let companyId = req.headers['x-company-id'] as string;

    // Priority 2: Subdomain (future implementation)
    // const hostname = req.hostname;
    // const subdomain = hostname.split('.')[0];
    // if (subdomain && subdomain !== 'www' && subdomain !== 'api') {
    //   companyId = subdomain;
    // }

    // Priority 3: From authenticated user (if already authenticated)
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

    // Validate company exists and is active
    const company = await Company.findById(companyId);
    
    if (!company) {
      res.status(401).json({
        success: false,
        message: 'Company not found',
      });
      return;
    }

    if (company.subscription.status !== 'active') {
      res.status(403).json({
        success: false,
        message: `Company subscription is ${company.subscription.status}`,
      });
      return;
    }

    // Inject companyId into request
    req.companyId = companyId;
    next();
  } catch (error) {
    next(error);
  }
};
