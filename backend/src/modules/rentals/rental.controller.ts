import { Request, Response, NextFunction } from 'express';
import { rentalService } from './rental.service';
import {
  createRentalSchema,
  updateRentalSchema,
  updateRentalStatusSchema,
  extendRentalSchema,
  updateChecklistSchema,
} from './rental.validator';

export class RentalController {
  /**
   * Create a new rental/reservation
   * POST /api/rentals
   */
  async createRental(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const userId = req.user!._id.toString();
      const validatedData = createRentalSchema.parse(req.body);
      const rental = await rentalService.createRental(companyId, validatedData, userId);

      res.status(201).json({
        success: true,
        message: 'Rental created successfully',
        data: rental,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all rentals with filters
   * GET /api/rentals
   */
  async getRentals(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const filters = {
        status: req.query.status as any,
        customerId: req.query.customerId as string,
        startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
        search: req.query.search as string,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      };

      const result = await rentalService.getRentals(companyId, filters);

      res.json({
        success: true,
        data: result.rentals,
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
   * Get rental by ID
   * GET /api/rentals/:id
   */
  async getRentalById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const rentalId = req.params.id;
      const rental = await rentalService.getRentalById(companyId, rentalId);

      if (!rental) {
        res.status(404).json({
          success: false,
          message: 'Rental not found',
        });
        return;
      }

      res.json({
        success: true,
        data: rental,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update rental status
   * PATCH /api/rentals/:id/status
   */
  async updateRentalStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const rentalId = req.params.id;
      const userId = req.user!._id.toString();
      const { status } = updateRentalStatusSchema.parse(req.body);
      const rental = await rentalService.updateRentalStatus(companyId, rentalId, status, userId);

      if (!rental) {
        res.status(404).json({
          success: false,
          message: 'Rental not found',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Rental status updated successfully',
        data: rental,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Extend rental period
   * PATCH /api/rentals/:id/extend
   */
  async extendRental(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const rentalId = req.params.id;
      const userId = req.user!._id.toString();
      const { newReturnDate } = extendRentalSchema.parse(req.body);
      const rental = await rentalService.extendRental(companyId, rentalId, new Date(newReturnDate), userId);

      if (!rental) {
        res.status(404).json({
          success: false,
          message: 'Rental not found',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Rental extended successfully',
        data: rental,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update pickup checklist
   * PATCH /api/rentals/:id/checklist/pickup
   */
  async updatePickupChecklist(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const rentalId = req.params.id;
      const userId = req.user!._id.toString();
      const checklist = updateChecklistSchema.parse(req.body);
      const rental = await rentalService.updatePickupChecklist(companyId, rentalId, checklist, userId);

      if (!rental) {
        res.status(404).json({
          success: false,
          message: 'Rental not found',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Pickup checklist updated successfully',
        data: rental,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update return checklist
   * PATCH /api/rentals/:id/checklist/return
   */
  async updateReturnChecklist(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const rentalId = req.params.id;
      const userId = req.user!._id.toString();
      const checklist = updateChecklistSchema.parse(req.body);
      const rental = await rentalService.updateReturnChecklist(companyId, rentalId, checklist, userId);

      if (!rental) {
        res.status(404).json({
          success: false,
          message: 'Rental not found',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Return checklist updated successfully',
        data: rental,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update rental (general update)
   * PUT /api/rentals/:id
   */
  async updateRental(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const rentalId = req.params.id;
      const userId = req.user!._id.toString();
      const validatedData = updateRentalSchema.parse(req.body);
      const rental = await rentalService.updateRental(companyId, rentalId, validatedData, userId);

      if (!rental) {
        res.status(404).json({
          success: false,
          message: 'Rental not found',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Rental updated successfully',
        data: rental,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Check and update overdue rentals
   * POST /api/rentals/check-overdue
   */
  async checkOverdueRentals(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const count = await rentalService.checkOverdueRentals(companyId);

      res.json({
        success: true,
        message: `${count} rental(s) marked as overdue`,
        count,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const rentalController = new RentalController();
