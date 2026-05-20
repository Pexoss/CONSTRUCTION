import { NextFunction, Request, Response } from "express";
import { financialService } from "./financial.service";

class FinancialController {
  async getBoard(req: Request, res: Response, next: NextFunction) {
    try {
      const companyId = req.companyId!;
      const data = await financialService.getUnifiedBoard(companyId, {
        customerId: req.query.customerId as string | undefined,
        status: req.query.status as string | undefined,
        startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
        billingIssuerId: req.query.billingIssuerId as string | undefined,
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async getDashboard(req: Request, res: Response, next: NextFunction) {
    try {
      const companyId = req.companyId!;
      const data = await financialService.getDashboard(companyId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const financialController = new FinancialController();

