import { Request, Response, NextFunction } from 'express';
import { transactionService } from './transaction.service';
import { createTransactionSchema, updateTransactionSchema } from './transaction.validator';

export class TransactionController {
  /**
   * Create a new transaction
   * POST /api/transactions
   */
  async createTransaction(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const userId = req.user!._id.toString();
      const validatedData = createTransactionSchema.parse(req.body);
      const transaction = await transactionService.createTransaction(
        companyId,
        validatedData,
        userId
      );

      res.status(201).json({
        success: true,
        message: 'Transaction created successfully',
        data: transaction,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all transactions with filters
   * GET /api/transactions
   */
  async getTransactions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const filters = {
        type: req.query.type as any,
        category: req.query.category as string,
        status: req.query.status as any,
        relatedToType: req.query.relatedToType as string,
        relatedToId: req.query.relatedToId as string,
        startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      };

      const result = await transactionService.getTransactions(companyId, filters);

      res.json({
        success: true,
        data: result.transactions,
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
   * Get transaction by ID
   * GET /api/transactions/:id
   */
  async getTransactionById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const transactionId = req.params.id;
      const transaction = await transactionService.getTransactionById(companyId, transactionId);

      if (!transaction) {
        res.status(404).json({
          success: false,
          message: 'Transaction not found',
        });
        return;
      }

      res.json({
        success: true,
        data: transaction,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update transaction
   * PUT /api/transactions/:id
   */
  async updateTransaction(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const transactionId = req.params.id;
      const validatedData = updateTransactionSchema.parse(req.body);
      const transaction = await transactionService.updateTransaction(
        companyId,
        transactionId,
        validatedData
      );

      if (!transaction) {
        res.status(404).json({
          success: false,
          message: 'Transaction not found',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Transaction updated successfully',
        data: transaction,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete transaction
   * DELETE /api/transactions/:id
   */
  async deleteTransaction(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const transactionId = req.params.id;
      await transactionService.deleteTransaction(companyId, transactionId);

      res.json({
        success: true,
        message: 'Transaction deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get financial dashboard
   * GET /api/transactions/dashboard
   */
  async getFinancialDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

      const dashboard = await transactionService.getFinancialDashboard(
        companyId,
        startDate,
        endDate
      );

      res.json({
        success: true,
        data: dashboard,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get accounts receivable
   * GET /api/transactions/receivable
   */
  async getAccountsReceivable(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const transactions = await transactionService.getAccountsReceivable(companyId);

      res.json({
        success: true,
        data: transactions,
        count: transactions.length,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get accounts payable
   * GET /api/transactions/payable
   */
  async getAccountsPayable(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const transactions = await transactionService.getAccountsPayable(companyId);

      res.json({
        success: true,
        data: transactions,
        count: transactions.length,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Check overdue transactions
   * POST /api/transactions/check-overdue
   */
  async checkOverdueTransactions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const count = await transactionService.checkOverdueTransactions(companyId);

      res.json({
        success: true,
        message: `${count} transaction(s) marked as overdue`,
        count,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const transactionController = new TransactionController();
