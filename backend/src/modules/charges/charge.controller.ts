import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { chargeService } from "./charge.service";

const createChargeSchema = z.object({
  billingIds: z.array(z.string()).min(1),
  dueDate: z.coerce.date().optional(),
  notes: z.string().optional(),
  totalOverride: z.number().nonnegative().optional(),
});

const paymentSchema = z.object({
  amount: z.number().positive(),
  discount: z.number().nonnegative().optional(),
  paymentMethod: z.string().optional(),
  notes: z.string().optional(),
  paidAt: z.coerce.date().optional(),
});

const updateChargeSchema = z.object({
  dueDate: z.coerce.date().optional(),
  notes: z.string().optional(),
  total: z.number().nonnegative().optional(),
  billingIds: z.array(z.string()).min(1).optional(),
});

class ChargeController {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const companyId = req.companyId!;
      const userId = req.user!._id.toString();
      const payload = createChargeSchema.parse(req.body);
      const charge = await chargeService.createCharge(companyId, userId, payload);
      res.status(201).json({ success: true, data: charge });
    } catch (error) {
      next(error);
    }
  }

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const companyId = req.companyId!;
      const charges = await chargeService.getCharges(companyId);
      res.json({ success: true, data: charges });
    } catch (error) {
      next(error);
    }
  }

  async applyPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const companyId = req.companyId!;
      const userId = req.user!._id.toString();
      const data = paymentSchema.parse(req.body);
      const charge = await chargeService.applyPayment(companyId, req.params.id, userId, data);
      res.json({ success: true, data: charge });
    } catch (error) {
      next(error);
    }
  }

  async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      const companyId = req.companyId!;
      const role = req.user?.role;
      const isAdmin = role === "admin" || role === "superadmin";
      const charge = await chargeService.cancelCharge(companyId, req.params.id, isAdmin);
      res.json({ success: true, data: charge });
    } catch (error) {
      next(error);
    }
  }

  async pdf(req: Request, res: Response, next: NextFunction) {
    try {
      const companyId = req.companyId!;
      const pdf = await chargeService.generateChargePDF(companyId, req.params.id);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename=charge-${req.params.id}.pdf`);
      res.send(pdf);
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const companyId = req.companyId!;
      const data = updateChargeSchema.parse(req.body);
      const charge = await chargeService.updateCharge(companyId, req.params.id, data);
      res.json({ success: true, data: charge });
    } catch (error) {
      next(error);
    }
  }
}

export const chargeController = new ChargeController();

