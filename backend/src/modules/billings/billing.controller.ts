import { Request, Response, NextFunction } from 'express';
import billingService from './billing.service';
import { rentalService } from '../rentals/rental.service';
import {
  createBillingSchema,
  approveBillingSchema,
  rejectBillingSchema,
  markAsPaidSchema,
  updateBillingSchema,
} from './billing.validator';

class BillingController {
  /**
   * Criar fechamento de aluguel
   */
  async createBilling(req: Request, res: Response, next: NextFunction) {
    try {
      const companyId = req.companyId!;
      const userId = req.user!._id.toString();
      const data = createBillingSchema.parse(req.body);

      const returnDate = typeof data.returnDate === 'string' ? new Date(data.returnDate) : data.returnDate;

      const billing = await billingService.createBilling(
        companyId,
        data.rentalId,
        returnDate,
        userId,
        data.discount,
        data.discountReason
      );

      res.status(201).json({
        success: true,
        data: billing,
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Listar fechamentos
   */
  async getBillings(req: Request, res: Response, next: NextFunction) {
    try {
      const companyId = req.companyId!;
      const filters: any = {};

      if (req.query.rentalId) filters.rentalId = req.query.rentalId as string;
      if (req.query.customerId) filters.customerId = req.query.customerId as string;
      if (req.query.status) filters.status = req.query.status as string;
      if (req.query.startDate) filters.startDate = new Date(req.query.startDate as string);
      if (req.query.endDate) {
        const end = new Date(req.query.endDate as string);
        end.setHours(23, 59, 59, 999);
        filters.endDate = end;
      }
      if (req.query.onlyOverdue !== undefined) {
        filters.onlyOverdue = String(req.query.onlyOverdue).toLowerCase() === 'true';
      }
      if (req.query.page) filters.page = parseInt(req.query.page as string);
      if (req.query.limit) filters.limit = parseInt(req.query.limit as string);

      const result = await billingService.getBillings(companyId, filters);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Resumo para dashboard (vencidos + próximos por periodEnd).
   */
  async getAttentionSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const companyId = req.companyId!;
      const raw = parseInt(String(req.query.horizonDays ?? '7'), 10);
      const horizonDays =
        Number.isFinite(raw) ? Math.min(90, Math.max(1, raw)) : 7;

      const data = await billingService.getBillingsAttentionSummary(
        companyId,
        horizonDays,
      );

      res.json({
        success: true,
        data,
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Cria fechamentos para aluguéis em aberto que ainda não possuem nenhum fechamento.
   */
  async syncMissingRentals(req: Request, res: Response, next: NextFunction) {
    try {
      const companyId = req.companyId!;
      const userId = req.user!._id.toString();

      const result = await rentalService.syncMissingBillingsForCompany(
        companyId,
        userId,
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Obter fechamento por ID
   */
  async getBillingById(req: Request, res: Response, next: NextFunction) {
    try {
      const companyId = req.companyId!;
      const { id } = req.params;

      const billing = await billingService.getBillingById(companyId, id);

      if (!billing) {
        return res.status(404).json({
          success: false,
          message: 'Billing not found',
        });
      }

      res.json({
        success: true,
        data: billing,
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Gerar PDF do fechamento
   */
  async generateBillingPDF(req: Request, res: Response, next: NextFunction) {
    try {
      const companyId = req.companyId!;
      const { id } = req.params;

      const pdfBuffer = await billingService.generateBillingPDF(companyId, id);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=billing-${id}.pdf`);
      res.send(pdfBuffer);
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Aprovar fechamento pendente
   */
  async approveBilling(req: Request, res: Response, next: NextFunction) {
    try {
      const companyId = req.companyId!;
      const userId = req.user!._id.toString();
      const { id } = req.params;
      const data = approveBillingSchema.parse(req.body);

      const billing = await billingService.approveBilling(companyId, id, userId, data.notes);

      res.json({
        success: true,
        data: billing,
        message: 'Billing approved successfully',
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Rejeitar fechamento pendente
   */
  async rejectBilling(req: Request, res: Response, next: NextFunction) {
    try {
      const companyId = req.companyId!;
      const userId = req.user!._id.toString();
      const { id } = req.params;
      const data = rejectBillingSchema.parse(req.body);

      const billing = await billingService.rejectBilling(companyId, id, userId, data.notes);

      res.json({
        success: true,
        data: billing,
        message: 'Billing rejected',
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Marcar fechamento como pago
   */
  async markAsPaid(req: Request, res: Response, next: NextFunction) {
    try {
      const companyId = req.companyId!;
      const { id } = req.params;
      const data = markAsPaidSchema.parse(req.body);

      const paymentDate = data.paymentDate ? (typeof data.paymentDate === 'string' ? new Date(data.paymentDate) : data.paymentDate) : undefined;

      const billing = await billingService.markAsPaid(
        companyId,
        id,
        data.paymentMethod,
        paymentDate,
        data.amount,
        data.discount,
        data.discountReason
      );

      res.json({
        success: true,
        data: billing,
        message: 'Billing marked as paid',
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Listar fechamentos pendentes de aprovação
   */
  async getPendingApprovals(req: Request, res: Response, next: NextFunction) {
    try {
      const companyId = req.companyId!;

      const billings = await billingService.getPendingApprovals(companyId);

      res.json({
        success: true,
        data: billings,
      });
    } catch (error: any) {
      next(error);
    }
  }

  async updateBilling(req: Request, res: Response, next: NextFunction) {
    try {
      const companyId = req.companyId!;
      const { id } = req.params;
      const data = updateBillingSchema.parse(req.body);
      const billing = await billingService.updateBilling(companyId, id, {
        periodStart: data.periodStart ? new Date(data.periodStart) : undefined,
        periodEnd: data.periodEnd ? new Date(data.periodEnd) : undefined,
        notes: data.notes,
        discount: data.discount,
        discountReason: data.discountReason,
      });
      res.json({ success: true, data: billing, message: 'Billing updated successfully' });
    } catch (error: any) {
      next(error);
    }
  }

  async cancelBilling(req: Request, res: Response, next: NextFunction) {
    try {
      const companyId = req.companyId!;
      const { id } = req.params;
      const billing = await billingService.cancelBilling(companyId, id);
      res.json({ success: true, data: billing, message: 'Billing cancelled successfully' });
    } catch (error: any) {
      next(error);
    }
  }

  async refreshBilling(req: Request, res: Response, next: NextFunction) {
    try {
      const companyId = req.companyId!;
      const { id } = req.params;
      const billing = await billingService.refreshBillingFromRental(companyId, id);
      res.json({ success: true, data: billing, message: 'Billing refreshed successfully' });
    } catch (error: any) {
      next(error);
    }
  }

  async previewRefreshBilling(req: Request, res: Response, next: NextFunction) {
    try {
      const companyId = req.companyId!;
      const { id } = req.params;
      const preview = await billingService.previewBillingRefresh(companyId, id);
      res.json({ success: true, data: preview });
    } catch (error: any) {
      next(error);
    }
  }
}

export default new BillingController();
