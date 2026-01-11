import { Request, Response, NextFunction } from 'express';
import { invoiceService } from './invoice.service';
import { createInvoiceFromRentalSchema, updateInvoiceSchema } from './invoice.validator';

export class InvoiceController {
  /**
   * Create invoice from rental
   * POST /api/invoices/from-rental
   */
  async createInvoiceFromRental(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const userId = req.user!._id.toString();
      const validatedData = createInvoiceFromRentalSchema.parse(req.body);
      const invoice = await invoiceService.createInvoiceFromRental(
        companyId,
        validatedData.rentalId,
        userId,
        {
          tax: validatedData.tax,
          discount: validatedData.discount,
          terms: validatedData.terms,
          notes: validatedData.notes,
        }
      );

      res.status(201).json({
        success: true,
        message: 'Invoice created successfully',
        data: invoice,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all invoices with filters
   * GET /api/invoices
   */
  async getInvoices(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const filters = {
        status: req.query.status as any,
        customerId: req.query.customerId as string,
        rentalId: req.query.rentalId as string,
        startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      };

      const result = await invoiceService.getInvoices(companyId, filters);

      res.json({
        success: true,
        data: result.invoices,
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
   * Get invoice by ID
   * GET /api/invoices/:id
   */
  async getInvoiceById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const invoiceId = req.params.id;
      const invoice = await invoiceService.getInvoiceById(companyId, invoiceId);

      if (!invoice) {
        res.status(404).json({
          success: false,
          message: 'Invoice not found',
        });
        return;
      }

      res.json({
        success: true,
        data: invoice,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Generate PDF for invoice
   * GET /api/invoices/:id/pdf
   */
  async generateInvoicePDF(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const invoiceId = req.params.id;
      const pdfBuffer = await invoiceService.generateInvoicePDF(companyId, invoiceId);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=invoice-${invoiceId}.pdf`);
      res.send(pdfBuffer);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update invoice status
   * PATCH /api/invoices/:id/status
   */
  async updateInvoiceStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const invoiceId = req.params.id;
      const { status } = req.body;

      if (!status) {
        res.status(400).json({
          success: false,
          message: 'Status is required',
        });
        return;
      }

      const invoice = await invoiceService.updateInvoiceStatus(companyId, invoiceId, status);

      if (!invoice) {
        res.status(404).json({
          success: false,
          message: 'Invoice not found',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Invoice status updated successfully',
        data: invoice,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update invoice
   * PUT /api/invoices/:id
   */
  async updateInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const invoiceId = req.params.id;
      const validatedData = updateInvoiceSchema.parse(req.body);
      const invoice = await invoiceService.updateInvoice(companyId, invoiceId, validatedData);

      if (!invoice) {
        res.status(404).json({
          success: false,
          message: 'Invoice not found',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Invoice updated successfully',
        data: invoice,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete invoice
   * DELETE /api/invoices/:id
   */
  async deleteInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const invoiceId = req.params.id;
      await invoiceService.deleteInvoice(companyId, invoiceId);

      res.json({
        success: true,
        message: 'Invoice deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}

export const invoiceController = new InvoiceController();
