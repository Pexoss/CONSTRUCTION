import { Request, Response, NextFunction } from "express";
import { reportService } from "./report.service";
import ExcelJS from "exceljs";
import { buildPdfReport } from "./report-pdf.util";
import { Rental } from "../rentals/rental.model";
import { Transaction } from "../transactions/transaction.model";

export class ReportController {
  /**
   * Translate billing status to Portuguese
   */
  private getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      paid: "Pago",
      approved: "A receber",
      pending_approval: "Pendente",
      cancelled: "Cancelado",
      draft: "Rascunho",
      sent: "Enviado",
    };
    return labels[status] || status;
  }

  private getRentalTypeLabel(rentalType: string): string {
    const labels: Record<string, string> = {
      daily: "Diário",
      weekly: "Semanal",
      biweekly: "Quinzenal",
      monthly: "Mensal",
    };
    return labels[rentalType] || rentalType;
  }

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

  async getInvoicesGeneratedReport(
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

      const report = await reportService.getInvoicesGeneratedReport(
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

  async getRentalItemsPeriodsReport(
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

      const report = await reportService.getRentalItemsPeriodsReport(
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
        { header: "Total Locação", key: "total", width: 15 },
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
      const transactions = await Transaction.find({
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

  async exportInvoicesGeneratedReport(
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

      const report = await reportService.getInvoicesGeneratedReport(
        companyId,
        startDate,
        endDate,
      );

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Faturas Geradas");

      worksheet.columns = [
        { header: "Número", key: "invoiceNumber", width: 20 },
        { header: "Cliente", key: "customerName", width: 35 },
        { header: "Contrato", key: "rentalNumber", width: 20 },
        { header: "Emissão", key: "issueDate", width: 15 },
        { header: "Vencimento", key: "dueDate", width: 15 },
        { header: "Pagamento", key: "paidDate", width: 15 },
        { header: "Status", key: "status", width: 15 },
        { header: "Valor", key: "total", width: 15 },
      ];

      report.invoices.forEach((invoice) => {
        worksheet.addRow({
          invoiceNumber: invoice.invoiceNumber,
          customerName: invoice.customerName,
          rentalNumber: invoice.rentalNumber || "—",
          issueDate: new Date(invoice.issueDate).toLocaleDateString("pt-BR"),
          dueDate: new Date(invoice.dueDate).toLocaleDateString("pt-BR"),
          paidDate: invoice.paidDate
            ? new Date(invoice.paidDate).toLocaleDateString("pt-BR")
            : "—",
          status: this.getStatusLabel(invoice.status),
          total: invoice.total,
        });
      });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=relatorio-faturas-geradas-${Date.now()}.xlsx`,
      );

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      next(error);
    }
  }

  async exportRentalItemsPeriodsReport(
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

      const report = await reportService.getRentalItemsPeriodsReport(
        companyId,
        startDate,
        endDate,
      );

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Aluguéis por Item");

      worksheet.columns = [
        { header: "Fechamento", key: "billingNumber", width: 20 },
        { header: "Contrato", key: "rentalNumber", width: 20 },
        { header: "Cliente", key: "customerName", width: 35 },
        { header: "Item", key: "itemName", width: 35 },
        { header: "Unidade", key: "unitId", width: 15 },
        { header: "Início", key: "periodStart", width: 15 },
        { header: "Fim", key: "periodEnd", width: 15 },
        { header: "Tipo", key: "rentalType", width: 15 },
        { header: "Quantidade", key: "quantity", width: 15 },
        { header: "Períodos", key: "periodsCharged", width: 15 },
        { header: "Valor Unit.", key: "unitPrice", width: 15 },
        { header: "Subtotal", key: "subtotal", width: 15 },
        { header: "Status", key: "status", width: 15 },
      ];

      report.items.forEach((item) => {
        worksheet.addRow({
          billingNumber: item.billingNumber,
          rentalNumber: item.rentalNumber || "—",
          customerName: item.customerName,
          itemName: item.itemName,
          unitId: item.unitId || "—",
          periodStart: new Date(item.periodStart).toLocaleDateString("pt-BR"),
          periodEnd: new Date(item.periodEnd).toLocaleDateString("pt-BR"),
          rentalType: this.getRentalTypeLabel(item.rentalType),
          quantity: item.quantity,
          periodsCharged: item.periodsCharged,
          unitPrice: item.unitPrice,
          subtotal: item.subtotal,
          status: this.getStatusLabel(item.status),
        });
      });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=relatorio-alugueis-itens-periodos-${Date.now()}.xlsx`,
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
   * GET /api/reports/receivables — faturas e fechamentos: recebido no período e a receber
   */
  async getReceivablesReport(
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

      const report = await reportService.getReceivablesReport(
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
   * GET /api/reports/receivables/export — Excel
   */
  async exportReceivablesReport(
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

      const report = await reportService.getReceivablesReport(
        companyId,
        startDate,
        endDate,
      );

      const money = (n: number) =>
        n.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

      const workbook = new ExcelJS.Workbook();
      const summarySheet = workbook.addWorksheet("Resumo");
      summarySheet.columns = [
        { header: "Tipo", key: "tipo", width: 18 },
        { header: "Recebido no período (R$)", key: "rec", width: 26 },
        { header: "A receber — pendências (R$)", key: "pend", width: 28 },
        { header: "Qtd pagos no período", key: "qPaid", width: 22 },
        { header: "Qtd pendentes", key: "qPen", width: 16 },
      ];
      summarySheet.addRow({
        tipo: "Fechamento",
        rec: money(report.summary.fechamento.receivedInPeriod),
        pend: money(report.summary.fechamento.pendingTotal),
        qPaid: report.summary.fechamento.paidCountInPeriod,
        qPen: report.summary.fechamento.pendingCount,
      });
      summarySheet.addRow({
        tipo: "Fatura",
        rec: money(report.summary.fatura.receivedInPeriod),
        pend: money(report.summary.fatura.pendingTotal),
        qPaid: report.summary.fatura.paidCountInPeriod,
        qPen: report.summary.fatura.pendingCount,
      });
      summarySheet.addRow({
        tipo: "Total geral",
        rec: money(report.summary.totals.receivedInPeriod),
        pend: money(report.summary.totals.pendingTotal),
        qPaid: "",
        qPen: "",
      });

      const paidSheet = workbook.addWorksheet("Pagos no período");
      paidSheet.columns = [
        { header: "Tipo", key: "tipo", width: 14 },
        { header: "Documento", key: "doc", width: 22 },
        { header: "Cliente", key: "cust", width: 32 },
        { header: "Valor (R$)", key: "amt", width: 16 },
        { header: "Data pagamento", key: "pdate", width: 16 },
        { header: "Forma", key: "pm", width: 18 },
        { header: "Vencimento", key: "due", width: 14 },
        { header: "Aluguel", key: "rental", width: 14 },
      ];
      for (const row of report.paidInPeriod) {
        paidSheet.addRow({
          tipo: row.kind === "fechamento" ? "Fechamento" : "Fatura",
          doc: row.documentNumber,
          cust: row.customerName,
          amt: money(row.amount),
          pdate: row.paymentDate
            ? new Date(row.paymentDate).toLocaleDateString("pt-BR")
            : "—",
          pm: row.paymentMethod ?? "—",
          due: row.dueDate
            ? new Date(row.dueDate).toLocaleDateString("pt-BR")
            : "—",
          rental: row.rentalNumber ?? "—",
        });
      }

      const pendSheet = workbook.addWorksheet("Pendências");
      pendSheet.columns = [
        { header: "Tipo", key: "tipo", width: 14 },
        { header: "Documento", key: "doc", width: 22 },
        { header: "Cliente", key: "cust", width: 32 },
        { header: "Valor (R$)", key: "amt", width: 16 },
        { header: "Vencimento", key: "due", width: 14 },
        { header: "Emissão / ref.", key: "ref", width: 14 },
        { header: "Status", key: "st", width: 12 },
        { header: "Aluguel", key: "rental", width: 14 },
      ];
      for (const row of report.pending) {
        pendSheet.addRow({
          tipo: row.kind === "fechamento" ? "Fechamento" : "Fatura",
          doc: row.documentNumber,
          cust: row.customerName,
          amt: money(row.amount),
          due: row.dueDate
            ? new Date(row.dueDate).toLocaleDateString("pt-BR")
            : "—",
          ref: row.referenceDate
            ? new Date(row.referenceDate).toLocaleDateString("pt-BR")
            : "—",
          st: this.getStatusLabel(row.status),
          rental: row.rentalNumber ?? "—",
        });
      }

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=relatorio-recebiveis-${Date.now()}.xlsx`,
      );

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/reports/receivables/export-pdf
   */
  async exportReceivablesReportPdf(
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

      const report = await reportService.getReceivablesReport(
        companyId,
        startDate,
        endDate,
      );

      const money = (n: number) =>
        n.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

      const subtitle = `Período: ${new Date(report.period.startDate).toLocaleDateString("pt-BR")} a ${new Date(report.period.endDate).toLocaleDateString("pt-BR")}`;

      const pdf = await buildPdfReport({
        title: "Recebíveis — fechamentos e faturas",
        subtitle,
        sections: [
          {
            title: "Resumo por tipo",
            headers: [
              "Tipo",
              "Recebido no período (R$)",
              "A receber (R$)",
              "Qtd pagos",
              "Qtd pendentes",
            ],
            rows: [
              [
                "Fechamento",
                money(report.summary.fechamento.receivedInPeriod),
                money(report.summary.fechamento.pendingTotal),
                String(report.summary.fechamento.paidCountInPeriod),
                String(report.summary.fechamento.pendingCount),
              ],
              [
                "Fatura",
                money(report.summary.fatura.receivedInPeriod),
                money(report.summary.fatura.pendingTotal),
                String(report.summary.fatura.paidCountInPeriod),
                String(report.summary.fatura.pendingCount),
              ],
              [
                "Total geral",
                money(report.summary.totals.receivedInPeriod),
                money(report.summary.totals.pendingTotal),
                "—",
                "—",
              ],
            ],
          },
          {
            title: "Pagos no período (data de pagamento)",
            headers: [
              "Tipo",
              "Documento",
              "Cliente",
              "Valor (R$)",
              "Data pag.",
              "Forma",
            ],
            rows: report.paidInPeriod.map((row) => [
              row.kind === "fechamento" ? "Fechamento" : "Fatura",
              row.documentNumber,
              row.customerName,
              money(row.amount),
              row.paymentDate
                ? new Date(row.paymentDate).toLocaleDateString("pt-BR")
                : "—",
              row.paymentMethod ?? "—",
            ]),
          },
          {
            title: "Pendências (a receber)",
            headers: [
              "Tipo",
              "Documento",
              "Cliente",
              "Valor (R$)",
              "Venc.",
              "Status",
            ],
            rows: report.pending.map((row) => [
              row.kind === "fechamento" ? "Fechamento" : "Fatura",
              row.documentNumber,
              row.customerName,
              money(row.amount),
              row.dueDate
                ? new Date(row.dueDate).toLocaleDateString("pt-BR")
                : "—",
              this.getStatusLabel(row.status),
            ]),
          },
        ],
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=relatorio-recebiveis-${Date.now()}.pdf`,
      );
      res.send(pdf);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/reports/rentals/export-pdf
   */
  async exportRentalsReportPdf(
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
      const rentals = await Rental.find({
        companyId,
        createdAt: { $gte: startDate, $lte: endDate },
      })
        .populate("customerId", "name cpfCnpj")
        .populate("items.itemId", "name sku")
        .lean();

      const money = (n: number) =>
        n.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

      const pdf = await buildPdfReport({
        title: "Relatório de aluguéis",
        subtitle: `${startDate.toLocaleDateString("pt-BR")} a ${endDate.toLocaleDateString("pt-BR")}`,
        sections: [
          {
            title: "Resumo",
            headers: ["Total de aluguéis", "Contratado (R$)", "Faturado (R$)", "Pendente (R$)"],
            rows: [
              [
                String(report.totalRentals),
                money(report.contractedRevenue || 0),
                money(report.billedRevenue || report.totalRevenue || 0),
                money(report.pendingRevenue || 0),
              ],
            ],
          },
          {
            title: "Detalhe",
            headers: [
              "Nº",
              "Cliente",
              "Reserva",
              "Retirada",
              "Devolução",
              "Status",
              "Locação (R$)",
            ],
            rows: rentals.map((r) => {
              const c = r.customerId as { name?: string } | undefined;
              return [
                String(r.rentalNumber),
                c?.name ?? "—",
                new Date(r.dates.reservedAt).toLocaleDateString("pt-BR"),
                new Date(r.dates.pickupScheduled).toLocaleDateString("pt-BR"),
                new Date(r.dates.returnScheduled).toLocaleDateString("pt-BR"),
                r.status,
                money(r.pricing?.total ?? 0),
              ];
            }),
          },
        ],
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=relatorio-alugueis-${Date.now()}.pdf`,
      );
      res.send(pdf);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/reports/financial/export-pdf
   */
  async exportFinancialReportPdf(
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
      const transactions = await Transaction.find({
        companyId,
        createdAt: { $gte: startDate, $lte: endDate },
      })
        .sort({ createdAt: 1 })
        .lean();

      const money = (n: number) =>
        n.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

      const pdf = await buildPdfReport({
        title: "Relatório financeiro (lançamentos)",
        subtitle: `${startDate.toLocaleDateString("pt-BR")} a ${endDate.toLocaleDateString("pt-BR")}`,
        sections: [
          {
            title: "Resumo",
            headers: ["Recebido", "Despesas", "Lucro", "Faturado", "Pendente"],
            rows: [
              [
                money(report.receivedInPeriod ?? report.totalIncome),
                money(report.totalExpenses),
                money(report.profit),
                money(report.billedInPeriod || 0),
                money(report.pendingTotal || 0),
              ],
            ],
          },
          {
            title: "Lançamentos",
            headers: ["Data", "Tipo", "Categoria", "Descrição", "Valor (R$)", "Status"],
            rows: transactions.map((t) => [
              new Date(t.createdAt || new Date()).toLocaleDateString("pt-BR"),
              t.type === "income" ? "Receita" : "Despesa",
              t.category,
              t.description ?? "—",
              money(t.amount),
              t.status,
            ]),
          },
        ],
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=relatorio-financeiro-${Date.now()}.pdf`,
      );
      res.send(pdf);
    } catch (error) {
      next(error);
    }
  }

  async exportInvoicesGeneratedReportPdf(
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

      const report = await reportService.getInvoicesGeneratedReport(
        companyId,
        startDate,
        endDate,
      );

      const money = (n: number) =>
        n.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

      const pdf = await buildPdfReport({
        title: "Relatório de faturas geradas",
        subtitle: `${startDate.toLocaleDateString("pt-BR")} a ${endDate.toLocaleDateString("pt-BR")}`,
        sections: [
          {
            title: "Resumo",
            headers: ["Qtd", "Valor gerado", "Pago", "Pendente", "Cancelado"],
            rows: [
              [
                String(report.totalInvoices),
                money(report.totalAmount),
                money(report.paidAmount),
                money(report.pendingAmount),
                money(report.cancelledAmount),
              ],
            ],
          },
          {
            title: "Faturas",
            headers: ["Número", "Cliente", "Emissão", "Vencimento", "Status", "Valor (R$)"],
            rows: report.invoices.map((invoice) => [
              invoice.invoiceNumber,
              invoice.customerName,
              new Date(invoice.issueDate).toLocaleDateString("pt-BR"),
              new Date(invoice.dueDate).toLocaleDateString("pt-BR"),
              this.getStatusLabel(invoice.status),
              money(invoice.total),
            ]),
          },
        ],
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=relatorio-faturas-geradas-${Date.now()}.pdf`,
      );
      res.send(pdf);
    } catch (error) {
      next(error);
    }
  }

  async exportRentalItemsPeriodsReportPdf(
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

      const report = await reportService.getRentalItemsPeriodsReport(
        companyId,
        startDate,
        endDate,
      );

      const money = (n: number) =>
        n.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

      const pdf = await buildPdfReport({
        title: "Relatório de aluguéis por itens/períodos",
        subtitle: `${startDate.toLocaleDateString("pt-BR")} a ${endDate.toLocaleDateString("pt-BR")}`,
        sections: [
          {
            title: "Resumo",
            headers: ["Linhas", "Quantidade", "Valor total"],
            rows: [
              [
                String(report.totalLines),
                String(report.totalQuantity),
                money(report.totalAmount),
              ],
            ],
          },
          {
            title: "Itens por período",
            headers: ["Fech.", "Contrato", "Cliente", "Item", "Período", "Tipo", "Qtd", "Subtotal"],
            rows: report.items.map((item) => [
              item.billingNumber,
              item.rentalNumber || "—",
              item.customerName,
              item.itemName,
              `${new Date(item.periodStart).toLocaleDateString("pt-BR")} a ${new Date(item.periodEnd).toLocaleDateString("pt-BR")}`,
              this.getRentalTypeLabel(item.rentalType),
              String(item.quantity),
              money(item.subtotal),
            ]),
          },
        ],
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=relatorio-alugueis-itens-periodos-${Date.now()}.pdf`,
      );
      res.send(pdf);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/reports/maintenance/export-pdf
   */
  async exportMaintenanceReportPdf(
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

      const money = (n: number) =>
        n.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

      const pdf = await buildPdfReport({
        title: "Relatório de manutenções",
        subtitle: `${startDate.toLocaleDateString("pt-BR")} a ${endDate.toLocaleDateString("pt-BR")}`,
        sections: [
          {
            title: "Resumo",
            headers: [
              "Qtd total",
              "Custo total",
              "Agend.",
              "Em and.",
              "Concl.",
            ],
            rows: [
              [
                String(report.totalMaintenances),
                money(report.totalCost),
                String(report.byStatus.scheduled),
                String(report.byStatus.in_progress),
                String(report.byStatus.completed),
              ],
            ],
          },
          {
            title: "Por mês",
            headers: ["Mês", "Quantidade", "Custo (R$)"],
            rows: report.byMonth.map((m) => [
              m.month,
              String(m.count),
              money(m.cost),
            ]),
          },
        ],
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=relatorio-manutencoes-${Date.now()}.pdf`,
      );
      res.send(pdf);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/reports/inventory/export-pdf
   */
  async exportInventoryReportPdf(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const companyId = req.companyId!;

      const report = await reportService.getInventoryReport(companyId);

      const money = (n: number) =>
        n.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

      const pdf = await buildPdfReport({
        title: "Relatório de inventário",
        subtitle: "Posição consolidada",
        sections: [
          {
            title: "Totais",
            headers: [
              "Itens",
              "Ativos",
              "Estoque",
              "Dispon.",
              "Alugados",
              "Manut.",
              "Danif.",
            ],
            rows: [
              [
                String(report.totalItems),
                String(report.activeItems),
                String(report.totalStock),
                String(report.totalAvailable),
                String(report.totalRented),
                String(report.totalMaintenance),
                String(report.totalDamaged),
              ],
            ],
          },
          {
            title: "Receita aluguéis concluídos (referência)",
            headers: ["Valor (R$)"],
            rows: [[money(report.totalCompletedRevenue)]],
          },
        ],
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=relatorio-inventario-${Date.now()}.pdf`,
      );
      res.send(pdf);
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
