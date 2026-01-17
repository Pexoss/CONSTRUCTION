import { Request, Response, NextFunction } from 'express';
import billingService from './billing.service';
import { createBillingSchema, approveBillingSchema, rejectBillingSchema, markAsPaidSchema } from './billing.validator';

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
      if (req.query.endDate) filters.endDate = new Date(req.query.endDate as string);
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

      const billing = await billingService.markAsPaid(companyId, id, data.paymentMethod, paymentDate);

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
}

export default new BillingController();
