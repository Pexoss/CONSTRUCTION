import { Request, Response, NextFunction } from "express";
import { partnerService } from "./partner.service";
import {
  createPartnerSchema,
  updatePartnerSchema,
  returnPartnerLoanSchema,
} from "./partner.validator";

class PartnerController {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const companyId = req.companyId!;
      const data = createPartnerSchema.parse(req.body);
      const partner = await partnerService.createPartner(companyId, data);
      res.status(201).json({
        success: true,
        message: "Parceiro criado com sucesso",
        data: partner,
      });
    } catch (error) {
      next(error);
    }
  }

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const companyId = req.companyId!;
      const isActiveRaw = req.query.isActive;
      const filters = {
        search: req.query.search as string | undefined,
        isActive:
          isActiveRaw === "true"
            ? true
            : isActiveRaw === "false"
              ? false
              : undefined,
        page: req.query.page ? parseInt(String(req.query.page), 10) : 1,
        limit: req.query.limit ? parseInt(String(req.query.limit), 10) : 50,
      };
      const result = await partnerService.getPartners(companyId, filters);
      res.json({
        success: true,
        data: result.partners,
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

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const partner = await partnerService.getPartnerById(
        req.companyId!,
        req.params.id,
      );
      if (!partner) {
        res.status(404).json({ success: false, message: "Parceiro não encontrado" });
        return;
      }
      res.json({ success: true, data: partner });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const data = updatePartnerSchema.parse(req.body);
      const partner = await partnerService.updatePartner(
        req.companyId!,
        req.params.id,
        data,
      );
      res.json({
        success: true,
        message: "Parceiro atualizado com sucesso",
        data: partner,
      });
    } catch (error) {
      next(error);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      await partnerService.deletePartner(req.companyId!, req.params.id);
      res.json({ success: true, message: "Parceiro excluído com sucesso" });
    } catch (error) {
      next(error);
    }
  }

  async listLoans(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await partnerService.getLoans(req.companyId!, {
        partnerId: req.query.partnerId as string | undefined,
        status: req.query.status as any,
        rentalId: req.query.rentalId as string | undefined,
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
        page: req.query.page ? parseInt(String(req.query.page), 10) : 1,
        limit: req.query.limit ? parseInt(String(req.query.limit), 10) : 50,
      });
      res.json({
        success: true,
        data: result.loans,
        summary: result.summary,
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

  async returnLoan(req: Request, res: Response, next: NextFunction) {
    try {
      const body = returnPartnerLoanSchema.parse(req.body || {});
      const loan = await partnerService.returnToPartner(
        req.companyId!,
        req.params.id,
        body.quantity,
      );
      res.json({
        success: true,
        message: "Devolução ao parceiro registrada",
        data: loan,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const partnerController = new PartnerController();
