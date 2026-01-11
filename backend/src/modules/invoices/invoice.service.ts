import { Invoice } from './invoice.model';
import { Rental } from '../rentals/rental.model';
import { Customer } from '../customers/customer.model';
import { Company } from '../companies/company.model';
import { Item } from '../inventory/item.model';
import { IInvoice, InvoiceStatus } from './invoice.types';
import PDFDocument from 'pdfkit';

class InvoiceService {
  /**
   * Create invoice from rental
   */
  async createInvoiceFromRental(
    companyId: string,
    rentalId: string,
    userId: string,
    options?: { tax?: number; discount?: number; terms?: string; notes?: string }
  ): Promise<IInvoice> {
    const rental = await Rental.findOne({ _id: rentalId, companyId })
      .populate('customerId')
      .populate('items.itemId');

    if (!rental) {
      throw new Error('Rental not found');
    }

    // Build invoice items from rental items
    // After populate, itemId is an Item document, not ObjectId
    const items = rental.items.map((item) => {
      const itemData = item.itemId as any; // Type assertion needed because populate changes the type
      const description = itemData && typeof itemData === 'object' && 'name' in itemData
        ? itemData.name
        : 'Item';
      
      return {
        description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.subtotal,
      };
    });

    const subtotal = rental.pricing.subtotal;
    const tax = options?.tax || 0;
    const discount = options?.discount || rental.pricing.discount || 0;
    const total = subtotal + tax - discount;

    const invoice = await Invoice.create({
      companyId,
      rentalId: rental._id,
      customerId:
        typeof rental.customerId === 'object' ? rental.customerId._id : rental.customerId,
      items,
      subtotal,
      tax,
      discount,
      total,
      status: 'draft',
      issueDate: new Date(),
      dueDate: rental.dates.returnScheduled,
      terms: options?.terms,
      notes: options?.notes,
      createdBy: userId,
    });

    return invoice;
  }

  /**
   * Get all invoices with filters
   */
  async getInvoices(
    companyId: string,
    filters: {
      status?: InvoiceStatus;
      customerId?: string;
      rentalId?: string;
      startDate?: Date;
      endDate?: Date;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ invoices: IInvoice[]; total: number; page: number; limit: number }> {
    const query: any = { companyId };

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.customerId) {
      query.customerId = filters.customerId;
    }

    if (filters.rentalId) {
      query.rentalId = filters.rentalId;
    }

    if (filters.startDate || filters.endDate) {
      query.issueDate = {};
      if (filters.startDate) query.issueDate.$gte = filters.startDate;
      if (filters.endDate) query.issueDate.$lte = filters.endDate;
    }

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const [invoices, total] = await Promise.all([
      Invoice.find(query)
        .populate('customerId', 'name cpfCnpj email phone')
        .populate('rentalId', 'rentalNumber')
        .populate('createdBy', 'name email')
        .sort({ issueDate: -1 })
        .skip(skip)
        .limit(limit),
      Invoice.countDocuments(query),
    ]);

    return { invoices, total, page, limit };
  }

  /**
   * Get invoice by ID
   */
  async getInvoiceById(companyId: string, invoiceId: string): Promise<IInvoice | null> {
    return Invoice.findOne({ _id: invoiceId, companyId })
      .populate('customerId', 'name cpfCnpj email phone address')
      .populate('rentalId')
      .populate('createdBy', 'name email');
  }

  /**
   * Update invoice status
   */
  async updateInvoiceStatus(
    companyId: string,
    invoiceId: string,
    status: InvoiceStatus
  ): Promise<IInvoice | null> {
    const invoice = await Invoice.findOne({ _id: invoiceId, companyId });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    invoice.status = status;

    if (status === 'sent' && !invoice.sentAt) {
      invoice.sentAt = new Date();
    }

    if (status === 'paid' && !invoice.paidDate) {
      invoice.paidDate = new Date();
    }

    await invoice.save();
    return invoice;
  }

  /**
   * Generate PDF for invoice
   */
  async generateInvoicePDF(companyId: string, invoiceId: string): Promise<Buffer> {
    const invoice = await Invoice.findOne({ _id: invoiceId, companyId })
      .populate('customerId')
      .populate('rentalId')
      .populate('companyId');

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    const company = invoice.companyId as any;
    const customer = invoice.customerId as any;
    const rental = invoice.rentalId as any;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(20).text('FATURA', { align: 'center' });
      doc.moveDown();

      // Company Info
      doc.fontSize(12).text(company.name || 'Empresa', { align: 'left' });
      if (company.cnpj) doc.text(`CNPJ: ${company.cnpj}`);
      if (company.email) doc.text(`Email: ${company.email}`);
      if (company.phone) doc.text(`Telefone: ${company.phone}`);
      doc.moveDown();

      // Invoice Info
      doc.fontSize(14).text(`Fatura Nº: ${invoice.invoiceNumber}`);
      doc.text(`Data de Emissão: ${new Date(invoice.issueDate).toLocaleDateString('pt-BR')}`);
      doc.text(`Data de Vencimento: ${new Date(invoice.dueDate).toLocaleDateString('pt-BR')}`);
      doc.moveDown();

      // Customer Info
      doc.fontSize(12).text('Cliente:', { underline: true });
      doc.text(customer.name || 'Cliente');
      if (customer.cpfCnpj) doc.text(`CPF/CNPJ: ${customer.cpfCnpj}`);
      if (customer.email) doc.text(`Email: ${customer.email}`);
      if (customer.phone) doc.text(`Telefone: ${customer.phone}`);
      doc.moveDown();

      // Items Table
      doc.fontSize(12).text('Itens:', { underline: true });
      doc.moveDown(0.5);

      const tableTop = doc.y;
      const itemHeight = 20;
      let y = tableTop;

      // Table Header
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('Descrição', 50, y);
      doc.text('Qtd', 300, y);
      doc.text('Valor Unit.', 350, y, { width: 80, align: 'right' });
      doc.text('Total', 450, y, { width: 80, align: 'right' });
      y += itemHeight;

      // Table Items
      doc.font('Helvetica');
      invoice.items.forEach((item) => {
        doc.text(item.description, 50, y, { width: 240 });
        doc.text(item.quantity.toString(), 300, y);
        doc.text(`R$ ${item.unitPrice.toFixed(2)}`, 350, y, { width: 80, align: 'right' });
        doc.text(`R$ ${item.total.toFixed(2)}`, 450, y, { width: 80, align: 'right' });
        y += itemHeight;
      });

      // Totals
      y += 10;
      doc.font('Helvetica');
      doc.text(`Subtotal:`, 350, y, { width: 80, align: 'right' });
      doc.text(`R$ ${invoice.subtotal.toFixed(2)}`, 450, y, { width: 80, align: 'right' });
      y += itemHeight;

      if (invoice.discount && invoice.discount > 0) {
        doc.text(`Desconto:`, 350, y, { width: 80, align: 'right' });
        doc.text(`R$ ${invoice.discount.toFixed(2)}`, 450, y, { width: 80, align: 'right' });
        y += itemHeight;
      }

      if (invoice.tax && invoice.tax > 0) {
        doc.text(`Impostos:`, 350, y, { width: 80, align: 'right' });
        doc.text(`R$ ${invoice.tax.toFixed(2)}`, 450, y, { width: 80, align: 'right' });
        y += itemHeight;
      }

      doc.font('Helvetica-Bold').fontSize(12);
      doc.text(`Total:`, 350, y, { width: 80, align: 'right' });
      doc.text(`R$ ${invoice.total.toFixed(2)}`, 450, y, { width: 80, align: 'right' });

      // Notes and Terms
      if (invoice.notes || invoice.terms) {
        y += itemHeight * 2;
        doc.font('Helvetica').fontSize(10);
        if (invoice.notes) {
          doc.text('Observações:', 50, y);
          doc.text(invoice.notes, 50, y + 15, { width: 500 });
          y += 40;
        }
        if (invoice.terms) {
          doc.text('Termos e Condições:', 50, y);
          doc.text(invoice.terms, 50, y + 15, { width: 500 });
        }
      }

      doc.end();
    });
  }

  /**
   * Update invoice
   */
  async updateInvoice(companyId: string, invoiceId: string, data: any): Promise<IInvoice | null> {
    const invoice = await Invoice.findOne({ _id: invoiceId, companyId });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    Object.assign(invoice, data);
    await invoice.save();

    return invoice;
  }

  /**
   * Delete invoice
   */
  async deleteInvoice(companyId: string, invoiceId: string): Promise<boolean> {
    const result = await Invoice.deleteOne({ _id: invoiceId, companyId });
    return result.deletedCount > 0;
  }
}

export const invoiceService = new InvoiceService();
