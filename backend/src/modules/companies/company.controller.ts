import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { Company } from './company.model';
import { env } from '../../config/env';
import {
  updateCompanyCpfCnpjSettingsSchema,
  updateCompanyInvoiceIssuersSchema,
} from './company.validator';
import { isValidCnpj, normalizeDocument } from '../../shared/utils/document.utils';

/** Garante o CNPJ principal da empresa (`company.cnpj`) como emissor Matriz quando ainda não estiver entre os emissores (ex.: apenas filiais salvas manualmente). */
async function ensureMatrizIssuerFromCompanyCnpj(company: any): Promise<void> {
  const cleanMain = company?.cnpj ? normalizeDocument(String(company.cnpj)) : '';
  if (cleanMain.length !== 14 || !isValidCnpj(cleanMain)) return;

  const issuers: any[] = company.invoiceIssuers || [];
  if (issuers.some((r) => normalizeDocument(String(r?.cnpj || '')) === cleanMain)) return;

  company.invoiceIssuers = [{ label: 'Matriz', cnpj: cleanMain }, ...issuers];
  await company.save();
}

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

  /**
   * Lista emissores usados nas faturas (CNPJ da empresa emissora na nota + numeração).
   */
  async getInvoiceIssuers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const company = await Company.findById(companyId).select('invoiceIssuers cnpj');
      if (!company) {
        res.status(404).json({ success: false, message: 'Company not found' });
        return;
      }

      await ensureMatrizIssuerFromCompanyCnpj(company);

      const fresh = await Company.findById(companyId).select('invoiceIssuers').orFail();

      const list = (fresh.invoiceIssuers || []).map((row: any) => ({
        id: String(row._id),
        label: String(row.label || '').trim() || 'Matriz',
        cnpj: normalizeDocument(String(row.cnpj || '')),
        initialInvoiceNumber:
          typeof row.initialInvoiceNumber === 'number' && Number.isFinite(row.initialInvoiceNumber)
            ? Math.max(1, Math.floor(row.initialInvoiceNumber))
            : 1,
      }));

      res.json({ success: true, data: list });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Substitui a lista de emissores (roteador de faturas / numeração por CNPJ).
   */
  async updateInvoiceIssuers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const parsed = updateCompanyInvoiceIssuersSchema.parse(req.body);

      const seen = new Set<string>();
      const nextIssuers: Array<{
        _id?: mongoose.Types.ObjectId;
        label: string;
        cnpj: string;
        initialInvoiceNumber: number;
      }> = [];
      for (const row of parsed.issuers) {
        const cnpj = normalizeDocument(row.cnpj);
        if (cnpj.length !== 14 || !isValidCnpj(cnpj)) {
          res.status(400).json({ success: false, message: 'CNPJ inválido para emissor de fatura' });
          return;
        }
        if (seen.has(cnpj)) {
          res.status(400).json({ success: false, message: 'Não são permitidos CNPJs repetidos entre emissores' });
          return;
        }
        seen.add(cnpj);
        const initialInvoiceNumber =
          row.initialInvoiceNumber !== undefined && row.initialInvoiceNumber !== null
            ? Math.max(1, Math.floor(Number(row.initialInvoiceNumber)))
            : 1;
        const sub: {
          _id?: mongoose.Types.ObjectId;
          label: string;
          cnpj: string;
          initialInvoiceNumber: number;
        } = {
          label: row.label.trim(),
          cnpj,
          initialInvoiceNumber,
        };
        if (row.id && mongoose.isValidObjectId(row.id)) {
          sub._id = new mongoose.Types.ObjectId(row.id);
        }
        nextIssuers.push(sub);
      }

      const companyParent = await Company.findById(companyId).select('cnpj');
      const cleanMainCnpj = companyParent?.cnpj
        ? normalizeDocument(String(companyParent.cnpj))
        : '';
      let finalIssuers = nextIssuers;
      if (cleanMainCnpj.length === 14 && isValidCnpj(cleanMainCnpj) && !seen.has(cleanMainCnpj)) {
        finalIssuers = [
          { label: 'Matriz', cnpj: cleanMainCnpj, initialInvoiceNumber: 1 },
          ...nextIssuers,
        ];
      }

      const company = await Company.findByIdAndUpdate(
        companyId,
        { $set: { invoiceIssuers: finalIssuers as any } },
        { new: true },
      ).select('invoiceIssuers');

      if (!company) {
        res.status(404).json({ success: false, message: 'Company not found' });
        return;
      }

      const list = (company.invoiceIssuers || []).map((row: any) => ({
        id: String(row._id),
        label: String(row.label || '').trim() || 'Matriz',
        cnpj: normalizeDocument(String(row.cnpj || '')),
        initialInvoiceNumber:
          typeof row.initialInvoiceNumber === 'number' && Number.isFinite(row.initialInvoiceNumber)
            ? Math.max(1, Math.floor(row.initialInvoiceNumber))
            : 1,
      }));

      res.json({
        success: true,
        message: 'Emissores de fatura atualizados.',
        data: list,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const companyController = new CompanyController();
