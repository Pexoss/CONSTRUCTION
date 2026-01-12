import { Request, Response, NextFunction } from 'express';
import { reportService } from './report.service';
import ExcelJS from 'exceljs';

export class ReportController {
  /**
   * Get rentals report
   * GET /api/reports/rentals
   */
  async getRentalsReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const startDate = new Date(req.query.startDate as string);
      const endDate = new Date(req.query.endDate as string);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        res.status(400).json({
          success: false,
          message: 'Invalid date range',
        });
        return;
      }

      const report = await reportService.getRentalsReport(companyId, startDate, endDate);

      res.json({
        success: true,
        data: report,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get financial report
   * GET /api/reports/financial
   */
  async getFinancialReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const startDate = new Date(req.query.startDate as string);
      const endDate = new Date(req.query.endDate as string);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        res.status(400).json({
          success: false,
          message: 'Invalid date range',
        });
        return;
      }

      const report = await reportService.getFinancialReport(companyId, startDate, endDate);

      res.json({
        success: true,
        data: report,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get most rented items
   * GET /api/reports/most-rented-items
   */
  async getMostRentedItems(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

      const items = await reportService.getMostRentedItems(companyId, startDate, endDate, limit);

      res.json({
        success: true,
        data: items,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get equipment occupancy rate
   * GET /api/reports/occupancy-rate
   */
  async getOccupancyRate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const startDate = new Date(req.query.startDate as string);
      const endDate = new Date(req.query.endDate as string);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        res.status(400).json({
          success: false,
          message: 'Invalid date range',
        });
        return;
      }

      const report = await reportService.getEquipmentOccupancyRate(companyId, startDate, endDate);

      res.json({
        success: true,
        data: report,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get top customers
   * GET /api/reports/top-customers
   */
  async getTopCustomers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

      const customers = await reportService.getTopCustomers(companyId, startDate, endDate, limit);

      res.json({
        success: true,
        data: customers,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get maintenance report
   * GET /api/reports/maintenance
   */
  async getMaintenanceReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const startDate = new Date(req.query.startDate as string);
      const endDate = new Date(req.query.endDate as string);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        res.status(400).json({
          success: false,
          message: 'Invalid date range',
        });
        return;
      }

      const report = await reportService.getMaintenanceReport(companyId, startDate, endDate);

      res.json({
        success: true,
        data: report,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Export rentals report to Excel
   * GET /api/reports/rentals/export
   */
  async exportRentalsReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const startDate = new Date(req.query.startDate as string);
      const endDate = new Date(req.query.endDate as string);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        res.status(400).json({
          success: false,
          message: 'Invalid date range',
        });
        return;
      }

      const report = await reportService.getRentalsReport(companyId, startDate, endDate);
      const { Rental } = await import('../rentals/rental.model');
      const rentals = await Rental.find({
        companyId,
        createdAt: { $gte: startDate, $lte: endDate },
      })
        .populate('customerId', 'name cpfCnpj')
        .populate('items.itemId', 'name sku');

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Relatório de Aluguéis');

      worksheet.columns = [
        { header: 'Número', key: 'rentalNumber', width: 15 },
        { header: 'Cliente', key: 'customer', width: 30 },
        { header: 'Data Reserva', key: 'reservedDate', width: 15 },
        { header: 'Data Retirada', key: 'pickupDate', width: 15 },
        { header: 'Data Devolução', key: 'returnDate', width: 15 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Valor Total', key: 'total', width: 15 },
      ];

      rentals.forEach((rental) => {
        const customerData = rental.customerId as any; // After populate, customerId is a Customer document
        const customerName = customerData && typeof customerData === 'object' && 'name' in customerData
          ? customerData.name
          : 'Cliente';
        
        worksheet.addRow({
          rentalNumber: rental.rentalNumber,
          customer: customerName,
          reservedDate: new Date(rental.dates.reservedAt).toLocaleDateString('pt-BR'),
          pickupDate: new Date(rental.dates.pickupScheduled).toLocaleDateString('pt-BR'),
          returnDate: new Date(rental.dates.returnScheduled).toLocaleDateString('pt-BR'),
          status: rental.status,
          total: rental.pricing.total,
        });
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=relatorio-alugueis-${Date.now()}.xlsx`);

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      next(error);
    }
  }

  /**
   * Export financial report to Excel
   * GET /api/reports/financial/export
   */
  async exportFinancialReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const startDate = new Date(req.query.startDate as string);
      const endDate = new Date(req.query.endDate as string);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        res.status(400).json({
          success: false,
          message: 'Invalid date range',
        });
        return;
      }

      const report = await reportService.getFinancialReport(companyId, startDate, endDate);
      const transactions = await (await import('../transactions/transaction.model')).Transaction.find({
        companyId,
        createdAt: { $gte: startDate, $lte: endDate },
      });

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Relatório Financeiro');

      worksheet.columns = [
        { header: 'Data', key: 'date', width: 15 },
        { header: 'Tipo', key: 'type', width: 15 },
        { header: 'Categoria', key: 'category', width: 20 },
        { header: 'Descrição', key: 'description', width: 40 },
        { header: 'Valor', key: 'amount', width: 15 },
        { header: 'Status', key: 'status', width: 15 },
      ];

      transactions.forEach((transaction) => {
        worksheet.addRow({
          date: new Date(transaction.createdAt || new Date()).toLocaleDateString('pt-BR'),
          type: transaction.type === 'income' ? 'Receita' : 'Despesa',
          category: transaction.category,
          description: transaction.description,
          amount: transaction.amount,
          status: transaction.status,
        });
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=relatorio-financeiro-${Date.now()}.xlsx`);

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      next(error);
    }
  }
}

export const reportController = new ReportController();
