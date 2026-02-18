import { Request, Response, NextFunction } from 'express';
import { Company } from './company.model';
import { env } from '../../config/env';
import { updateCompanyCpfCnpjSettingsSchema } from './company.validator';

export class CompanyController {
  /**
   * Get CPF/CNPJ settings for current company
   * GET /api/company/settings/cpfcnpj
   */
  async getCpfCnpjSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const company = await Company.findById(companyId).select('cpfCnpjToken cpfCnpjCpfPackageId cpfCnpjCnpjPackageId');

      if (!company) {
        res.status(404).json({
          success: false,
          message: 'Company not found',
        });
        return;
      }

      res.json({
        success: true,
        data: {
          tokenConfigured: !!company.cpfCnpjToken,
          cpfPackageId: company.cpfCnpjCpfPackageId || env.CPFCNPJ_CPF_PACKAGE_ID,
          cnpjPackageId: company.cpfCnpjCnpjPackageId || env.CPFCNPJ_CNPJ_PACKAGE_ID,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update CPF/CNPJ settings for current company
   * PATCH /api/company/settings/cpfcnpj
   */
  async updateCpfCnpjSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const { token, cpfPackageId, cnpjPackageId } = updateCompanyCpfCnpjSettingsSchema.parse(req.body);

      const update: any = {};
      const unset: any = {};

      if (token !== undefined) {
        const trimmed = token.trim();
        if (trimmed) {
          update.cpfCnpjToken = trimmed;
        } else {
          unset.cpfCnpjToken = '';
        }
      }

      if (cpfPackageId !== undefined) {
        const trimmed = cpfPackageId.trim();
        if (trimmed) {
          update.cpfCnpjCpfPackageId = trimmed;
        } else {
          unset.cpfCnpjCpfPackageId = '';
        }
      }

      if (cnpjPackageId !== undefined) {
        const trimmed = cnpjPackageId.trim();
        if (trimmed) {
          update.cpfCnpjCnpjPackageId = trimmed;
        } else {
          unset.cpfCnpjCnpjPackageId = '';
        }
      }

      const updateQuery: any = {};
      if (Object.keys(update).length > 0) updateQuery.$set = update;
      if (Object.keys(unset).length > 0) updateQuery.$unset = unset;

      const company = await Company.findByIdAndUpdate(companyId, updateQuery, { new: true }).select(
        'cpfCnpjToken cpfCnpjCpfPackageId cpfCnpjCnpjPackageId'
      );

      if (!company) {
        res.status(404).json({
          success: false,
          message: 'Company not found',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Configurações atualizadas com sucesso',
        data: {
          tokenConfigured: !!company.cpfCnpjToken,
          cpfPackageId: company.cpfCnpjCpfPackageId || env.CPFCNPJ_CPF_PACKAGE_ID,
          cnpjPackageId: company.cpfCnpjCnpjPackageId || env.CPFCNPJ_CNPJ_PACKAGE_ID,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const companyController = new CompanyController();
