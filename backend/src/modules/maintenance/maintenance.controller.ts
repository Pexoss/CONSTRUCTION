import { Request, Response, NextFunction } from 'express';
import { maintenanceService } from './maintenance.service';
import {
  createMaintenanceSchema,
  updateMaintenanceSchema,
  updateMaintenanceStatusSchema,
} from './maintenance.validator';

export class MaintenanceController {
  /**
   * Create a new maintenance record
   * POST /api/maintenance
   */
  async createMaintenance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const userId = req.user!._id.toString();
      const validatedData = createMaintenanceSchema.parse(req.body);
      const maintenance = await maintenanceService.createMaintenance(companyId, validatedData, userId);

      res.status(201).json({
        success: true,
        message: 'Maintenance created successfully',
        data: maintenance,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all maintenance records with filters
   * GET /api/maintenance
   */
  async getMaintenances(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const filters = {
        itemId: req.query.itemId as string,
        type: req.query.type as any,
        status: req.query.status as any,
        startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      };

      const result = await maintenanceService.getMaintenances(companyId, filters);

      res.json({
        success: true,
        data: result.maintenances,
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
   * Get maintenance by ID
   * GET /api/maintenance/:id
   */
  async getMaintenanceById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const maintenanceId = req.params.id;
      const maintenance = await maintenanceService.getMaintenanceById(companyId, maintenanceId);

      if (!maintenance) {
        res.status(404).json({
          success: false,
          message: 'Maintenance not found',
        });
        return;
      }

      res.json({
        success: true,
        data: maintenance,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get maintenance history for an item
   * GET /api/maintenance/item/:itemId
   */
  async getItemMaintenanceHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const itemId = req.params.itemId;
      const filters = {
        type: req.query.type as any,
        status: req.query.status as any,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      };

      const result = await maintenanceService.getItemMaintenanceHistory(companyId, itemId, filters);

      res.json({
        success: true,
        data: result.maintenances,
        total: result.total,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update maintenance status
   * PATCH /api/maintenance/:id/status
   */
  async updateMaintenanceStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const maintenanceId = req.params.id;
      const userId = req.user!._id.toString();
      const validatedData = updateMaintenanceStatusSchema.parse(req.body);
      const maintenance = await maintenanceService.updateMaintenanceStatus(
        companyId,
        maintenanceId,
        validatedData.status,
        userId,
        {
          completedDate: validatedData.completedDate
            ? new Date(validatedData.completedDate)
            : undefined,
          performedBy: validatedData.performedBy,
          notes: validatedData.notes,
        }
      );

      if (!maintenance) {
        res.status(404).json({
          success: false,
          message: 'Maintenance not found',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Maintenance status updated successfully',
        data: maintenance,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update maintenance
   * PUT /api/maintenance/:id
   */
  async updateMaintenance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const maintenanceId = req.params.id;
      const userId = req.user!._id.toString();
      const validatedData = updateMaintenanceSchema.parse(req.body);
      const maintenance = await maintenanceService.updateMaintenance(
        companyId,
        maintenanceId,
        validatedData,
        userId
      );

      if (!maintenance) {
        res.status(404).json({
          success: false,
          message: 'Maintenance not found',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Maintenance updated successfully',
        data: maintenance,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete maintenance
   * DELETE /api/maintenance/:id
   */
  async deleteMaintenance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const maintenanceId = req.params.id;
      const userId = req.user!._id.toString();
      await maintenanceService.deleteMaintenance(companyId, maintenanceId, userId);

      res.json({
        success: true,
        message: 'Maintenance deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get upcoming scheduled maintenances
   * GET /api/maintenance/upcoming
   */
  async getUpcomingMaintenances(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const days = req.query.days ? parseInt(req.query.days as string) : 30;
      const maintenances = await maintenanceService.getUpcomingMaintenances(companyId, days);

      res.json({
        success: true,
        data: maintenances,
        count: maintenances.length,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get maintenance statistics
   * GET /api/maintenance/statistics
   */
  async getMaintenanceStatistics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const itemId = req.query.itemId as string | undefined;
      const statistics = await maintenanceService.getMaintenanceStatistics(companyId, itemId);

      res.json({
        success: true,
        data: statistics,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const maintenanceController = new MaintenanceController();
