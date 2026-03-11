import { Request, Response, NextFunction } from "express";
import { reportService } from "./report.service";
import ExcelJS from "exceljs";

export class ReportController {
  /**
   * Get rentals report
   * GET /api/reports/rentals
   */
  async getRentalsReport(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = req.companyId!;
      const startDate = new Date(req.query.startDate as string);
      const endDate = new Date(req.query.endDate as string);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        res.status(400).json({
          success: false,
          message: "Invalid date range",
        });
        return;
      }

      const report = await reportService.getRentalsReport(
        companyId,
        startDate,
        endDate,
      );

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
  async getFinancialReport(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = req.companyId!;
      const startDate = new Date(req.query.startDate as string);
      const endDate = new Date(req.query.endDate as string);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        res.status(400).json({
          success: false,
          message: "Invalid date range",
        });
        return;
      }

      const report = await reportService.getFinancialReport(
        companyId,
        startDate,
        endDate,
      );

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
  async getMostRentedItems(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = req.companyId!;
      const startDate = req.query.startDate
        ? new Date(req.query.startDate as string)
        : undefined;
      const endDate = req.query.endDate
        ? new Date(req.query.endDate as string)
        : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

      const items = await reportService.getMostRentedItems(
        companyId,
        startDate,
        endDate,
        limit,
      );

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
  async getOccupancyRate(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = req.companyId!;
      const startDate = new Date(req.query.startDate as string);
      const endDate = new Date(req.query.endDate as string);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        res.status(400).json({
          success: false,
          message: "Invalid date range",
        });
        return;
      }

      const report = await reportService.getEquipmentOccupancyRate(
        companyId,
        startDate,
        endDate,
      );

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
  async getTopCustomers(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = req.companyId!;
      const startDate = req.query.startDate
        ? new Date(req.query.startDate as string)
        : undefined;
      const endDate = req.query.endDate
        ? new Date(req.query.endDate as string)
        : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

      const customers = await reportService.getTopCustomers(
        companyId,
        startDate,
        endDate,
        limit,
      );

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
  async getMaintenanceReport(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = req.companyId!;
      const startDate = new Date(req.query.startDate as string);
      const endDate = new Date(req.query.endDate as string);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        res.status(400).json({
          success: false,
          message: "Invalid date range",
        });
        return;
      }

      const report = await reportService.getMaintenanceReport(
        companyId,
        startDate,
        endDate,
      );

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
  async exportRentalsReport(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = req.companyId!;
      const startDate = new Date(req.query.startDate as string);
      const endDate = new Date(req.query.endDate as string);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        res.status(400).json({
          success: false,
          message: "Invalid date range",
        });
        return;
      }

      const report = await reportService.getRentalsReport(
        companyId,
        startDate,
        endDate,
      );
      const { Rental } = await import("../rentals/rental.model");
      const rentals = await Rental.find({
        companyId,
        createdAt: { $gte: startDate, $lte: endDate },
      })
        .populate("customerId", "name cpfCnpj")
        .populate("items.itemId", "name sku");

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Relatório de Aluguéis");

      worksheet.columns = [
        { header: "Número", key: "rentalNumber", width: 15 },
        { header: "Cliente", key: "customer", width: 30 },
        { header: "Data Reserva", key: "reservedDate", width: 15 },
        { header: "Data Retirada", key: "pickupDate", width: 15 },
        { header: "Data Devolução", key: "returnDate", width: 15 },
        { header: "Status", key: "status", width: 15 },
        { header: "Valor Total", key: "total", width: 15 },
      ];

      rentals.forEach((rental) => {
        const customerData = rental.customerId as any; // After populate, customerId is a Customer document
        const customerName =
          customerData &&
          typeof customerData === "object" &&
          "name" in customerData
            ? customerData.name
            : "Cliente";

        worksheet.addRow({
          rentalNumber: rental.rentalNumber,
          customer: customerName,
          reservedDate: new Date(rental.dates.reservedAt).toLocaleDateString(
            "pt-BR",
          ),
          pickupDate: new Date(rental.dates.pickupScheduled).toLocaleDateString(
            "pt-BR",
          ),
          returnDate: new Date(rental.dates.returnScheduled).toLocaleDateString(
            "pt-BR",
          ),
          status: rental.status,
          total: rental.pricing.total,
        });
      });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=relatorio-alugueis-${Date.now()}.xlsx`,
      );

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
  async exportFinancialReport(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = req.companyId!;
      const startDate = new Date(req.query.startDate as string);
      const endDate = new Date(req.query.endDate as string);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        res.status(400).json({
          success: false,
          message: "Invalid date range",
        });
        return;
      }

      const report = await reportService.getFinancialReport(
        companyId,
        startDate,
        endDate,
      );
      const transactions = await (
        await import("../transactions/transaction.model")
      ).Transaction.find({
        companyId,
        createdAt: { $gte: startDate, $lte: endDate },
      });

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Relatório Financeiro");

      worksheet.columns = [
        { header: "Data", key: "date", width: 15 },
        { header: "Tipo", key: "type", width: 15 },
        { header: "Categoria", key: "category", width: 20 },
        { header: "Descrição", key: "description", width: 40 },
        { header: "Valor", key: "amount", width: 15 },
        { header: "Status", key: "status", width: 15 },
      ];

      transactions.forEach((transaction) => {
        worksheet.addRow({
          date: new Date(
            transaction.createdAt || new Date(),
          ).toLocaleDateString("pt-BR"),
          type: transaction.type === "income" ? "Receita" : "Despesa",
          category: transaction.category,
          description: transaction.description,
          amount: transaction.amount,
          status: transaction.status,
        });
      });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=relatorio-financeiro-${Date.now()}.xlsx`,
      );

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      next(error);
    }
  }

  async exportInventoryReport(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = req.companyId!;

      // Chama o serviço do inventário
      const report = await reportService.getInventoryReport(companyId);

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Relatório de Inventário");

      // Colunas da planilha
      worksheet.columns = [
        { header: "Total de Itens", key: "totalItems", width: 20 },
        { header: "Itens Ativos", key: "activeItems", width: 20 },
        { header: "Estoque Total", key: "totalStock", width: 15 },
        { header: "Disponível", key: "totalAvailable", width: 15 },
        { header: "Alugados", key: "totalRented", width: 15 },
        { header: "Reservados", key: "totalReserved", width: 15 },
        { header: "Manutenção", key: "totalMaintenance", width: 15 },
        { header: "Danificados", key: "totalDamaged", width: 15 },
        {
          header: "Valor do Patrimônio",
          key: "totalPatrimonyValue",
          width: 20,
        },
      ];

      // Adiciona uma única linha com os totais
      worksheet.addRow({
        totalItems: report.totalItems,
        activeItems: report.activeItems,
        totalStock: report.totalStock,
        totalAvailable: report.totalAvailable,
        totalRented: report.totalRented,
        totalReserved: report.totalReserved,
        totalMaintenance: report.totalMaintenance,
        totalDamaged: report.totalDamaged,
      });

      // Cabeçalhos para download
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=relatorio-inventario-${Date.now()}.xlsx`,
      );

      // Envia o arquivo
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      next(error);
    }
  }

  async exportMaintenanceReport(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = req.companyId!;
      const { startDate, endDate } = req.query;

      const report = await reportService.getMaintenanceReport(
        companyId,
        new Date(startDate as string),
        new Date(endDate as string),
      );

      const workbook = new ExcelJS.Workbook();
      const summarySheet = workbook.addWorksheet("Resumo");

      summarySheet.columns = [
        { header: "Total de Manutenções", key: "totalMaintenances", width: 25 },
        { header: "Custo Total", key: "totalCost", width: 20 },
        { header: "Agendadas", key: "scheduled", width: 15 },
        { header: "Em Andamento", key: "inProgress", width: 18 },
        { header: "Concluídas", key: "completed", width: 15 },
        { header: "Custo Agendadas", key: "scheduledCost", width: 20 },
        { header: "Custo Em Andamento", key: "inProgressCost", width: 22 },
        { header: "Custo Concluídas", key: "completedCost", width: 20 },
      ];

      summarySheet.addRow({
        totalMaintenances: report.totalMaintenances,
        totalCost: report.totalCost,
        scheduled: report.byStatus.scheduled,
        inProgress: report.byStatus.in_progress,
        completed: report.byStatus.completed,
        scheduledCost: report.scheduledCost,
        inProgressCost: report.inProgressCost,
        completedCost: report.completedCost,
      });

      const monthlySheet = workbook.addWorksheet("Por Mês");

      monthlySheet.columns = [
        { header: "Mês", key: "month", width: 15 },
        { header: "Quantidade", key: "count", width: 15 },
        { header: "Custo (R$)", key: "cost", width: 18 },
      ];

      report.byMonth.forEach((m) => {
        monthlySheet.addRow({
          month: m.month,
          count: m.count,
          cost: m.cost,
        });
      });

      // =========================
      // Headers HTTP
      // =========================
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename=relatorio-manutencoes-${Date.now()}.xlsx`,
      );

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get inventory report
   * GET /api/reports/inventory
   */
  async getInventoryReport(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = req.companyId!;

      const report = await reportService.getInventoryReport(companyId);

      res.json({
        success: true,
        data: report,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get most rented inventory items (current stock perspective)
   * GET /api/reports/inventory/most-rented
   */
  async getMostRentedInventory(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = req.companyId!;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 5;

      const items = await reportService.getMostRentedInventoryItems(
        companyId,
        limit,
      );

      res.json({
        success: true,
        data: items,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const reportController = new ReportController();
