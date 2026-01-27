import { Request, Response, NextFunction } from 'express';
import { subscriptionService } from './subscription.service';
import { createPaymentSchema, markPaymentAsPaidSchema } from './subscription.validator';
import { Company } from '../companies/company.model';

export class SubscriptionController {
  /**
   * Create subscription payment (super admin only)
   * POST /api/admin/subscriptions/payments
   */
  async createPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.body.companyId || req.companyId!;
      const validatedData = createPaymentSchema.parse(req.body);
      const payment = await subscriptionService.createPayment(companyId, validatedData);

      res.status(201).json({
        success: true,
        message: 'Payment created successfully',
        data: payment,
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Get company payments
   * GET /api/admin/subscriptions/payments
   */
  async getCompanyPayments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.query.companyId ? (req.query.companyId as string) : req.companyId!;
      const filters = {
        status: req.query.status as any,
        plan: req.query.plan as any,
        startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      };

      const result = await subscriptionService.getCompanyPayments(companyId, filters);

      res.json({
        success: true,
        data: result.payments,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: Math.ceil(result.total / result.limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mark payment as paid
   * PATCH /api/admin/subscriptions/payments/:id/paid
   */
  async markPaymentAsPaid(req: Request, res: Response, next: NextFunction) {
    try {
      const companyId = req.query.companyId || req.body.companyId;
      const paymentId = req.params.paymentId;
      const validatedData = markPaymentAsPaidSchema.parse(req.body);

      const result = await subscriptionService.markPaymentAsPaid(
        companyId as string,
        paymentId,
        validatedData
      );

      res.status(200).json({
        success: true,
        message: 'Payment marked as paid',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get all companies (super admin only)
   * GET /api/admin/companies
   */
  async getAllCompanies(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters = {
        subscriptionStatus: req.query.subscriptionStatus as string,
        plan: req.query.plan as any,
        search: req.query.search as string,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      };

      const result = await subscriptionService.getAllCompanies(filters);

      res.json({
        success: true,
        data: result.companies,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: Math.ceil(result.total / result.limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get company metrics
   * GET /api/admin/companies/:id/metrics
   */
  async getCompanyMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.params.id;
      const metrics = await subscriptionService.getCompanyMetrics(companyId);

      res.json({
        success: true,
        data: metrics,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Check overdue payments
   * POST /api/admin/subscriptions/check-overdue
   */
  async checkOverduePayments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const count = await subscriptionService.checkOverduePayments();

      res.json({
        success: true,
        message: `${count} payment(s) marked as overdue`,
        count,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get upcoming payments
   * GET /api/admin/subscriptions/upcoming
   */
  async getUpcomingPayments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const days = req.query.days ? parseInt(req.query.days as string) : 7;
      const payments = await subscriptionService.getUpcomingPayments(days);

      res.json({
        success: true,
        data: payments,
        count: payments.length,
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const company = await Company.findById(id);

      if (!company) {
        return res.status(404).json({
          success: false,
          message: 'Empresa não encontrada',
        });
      }

      await Company.findByIdAndDelete(id);

      return res.status(200).json({
        success: true,
        message: 'Empresa excluída com sucesso',
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Erro ao excluir empresa',
      });
    }
  }
}

export const subscriptionController = new SubscriptionController();
