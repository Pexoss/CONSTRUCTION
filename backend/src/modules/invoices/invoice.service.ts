import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { Invoice } from "./invoice.model";
import { Rental } from "../rentals/rental.model";
import { Customer } from "../customers/customer.model";
import { Company } from "../companies/company.model";
import { Billing } from "../billings/billing.model";
import { IInvoice, InvoiceStatus } from "./invoice.types";
import PDFDocument from "pdfkit";
import { financialService } from "../financial/financial.service";
import { transactionService } from "../transactions/transaction.service";

const ISS_MUNICIPAL_NOTE =
  "A empresa abaixo identificada está dispensada de emitir documento fiscal de Serviços quando tributada pelo anexo III, tendo deduzido a parcela do ISS, conforme inciso V do parágrafo 4º do artigo 18 da Lei Complementar nº 123/2006.";

/** Cabeçalho institucional da fatura (PDF) — texto central; CNPJ alinhado ao layout comercial */
const INVOICE_HEADER_BRAND_LINES = [
  "ALUGUE EQUIPAMENTOS PARA CONSTRUÇÃO CIVIL",
  "",
  "AV. GOV. VALADARES, 2586 - JD. SÃO CARLOS,",
  "CEP 37137-254 - ALFENAS - MG",
  "TEL. (35) 9 8843-5154 / (35) 9 99761-2424",
  "",
  "CNPJ 28.408.479/0001-19",
];

function resolveInvoiceLogoPath(): string {
  return path.join(__dirname, "../../shared/imagens/alugue.png");
}

function resolveSicoobLogoPath(): string {
  return path.join(__dirname, "../../shared/imagens/sicoob.png");
}

const INVOICE_FOOTER_PIX = "Chave PIX: CNPJ 28.408.479/0001-19";

const INVOICE_FOOTER_BANK_LINES = [
  "Banco: 756 - Sicoob",
  "Agência: 3125",
  "Conta: 935338-0",
  "Titularidade: Alugue Equipamentos",
];

const RENTAL_TYPE_PT_LABEL: Record<string, string> = {
  daily: "Diário",
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
};

const LEGACY_INVOICE_PERIOD_REGEX = /\((\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})\)/;

function stripLegacyInvoiceDescription(description: string): string {
  const cleaned = description
    .replace(/\s*-\s*Locação\s*\([^)]+\)\s*(?:-\s*Qtd:\s*\d+)?\s*$/i, "")
    .replace(/\s*-\s*Período:\s*\d{2}\/\d{2}\/\d{4}\s*a\s*\d{2}\/\d{2}\/\d{4}\s*$/i, "")
    .trim();
  return cleaned || description;
}

function extractPeriodFromLegacyInvoiceDescription(description: string): string | null {
  const m = description.match(LEGACY_INVOICE_PERIOD_REGEX);
  if (m) return `${m[1]} a ${m[2]}`;
  const m2 = description.match(/Per[íi]odo:\s*(\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (m2) return `${m2[1]} a ${m2[2]}`;
  return null;
}

type InvoicePdfRow = {
  description: string;
  period: string;
  tipo: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

class InvoiceService {
  /**
   * Create invoice from rental
   */
  async createInvoiceFromRental(
    companyId: string,
    rentalId: string,
    userId: string,
    options?: {
      tax?: number;
      discount?: number;
      terms?: string;
      notes?: string;
    },
  ): Promise<IInvoice> {
    const rental = await Rental.findOne({ _id: rentalId, companyId })
      .populate("customerId")
      .populate("items.itemId");

    if (!rental) {
      throw new Error("Rental not found");
    }

    // Build invoice items from rental items
    // After populate, itemId is an Item document, not ObjectId
    const items = rental.items.map((item) => {
      const itemData = item.itemId as any; // Type assertion needed because populate changes the type
      const description =
        itemData && typeof itemData === "object" && "name" in itemData
          ? itemData.name
          : "Item";

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
    const invoiceNumber = `INV-${Date.now()}`;

    const invoice = await Invoice.create({
      invoiceNumber,
      companyId,
      rentalId: rental._id,
      customerId:
        typeof rental.customerId === "object"
          ? rental.customerId._id
          : rental.customerId,
      items,
      subtotal,
      tax,
      discount,
      total,
      status: "draft",
      issueDate: new Date(),
      dueDate: rental.dates.returnScheduled,
      terms: options?.terms,
      notes: options?.notes,
      createdBy: userId,
    });

    return invoice;
  }

  /**
   * Cria fatura a partir de um ou mais fechamentos (billings), mesmo cliente.
   */
  async createInvoiceFromBillings(
    companyId: string,
    userId: string,
    data: {
      billingIds: string[];
      tax?: number;
      discount?: number;
      terms?: string;
      notes?: string;
      paymentMethod?: string;
      obraDescription?: string;
      issueDate?: Date | string;
      dueDate?: Date | string;
    },
  ): Promise<IInvoice> {
    const ids = [...new Set(data.billingIds)].map((id) => new mongoose.Types.ObjectId(id));
    const billings = await Billing.find({
      _id: { $in: ids },
      companyId,
    })
      .populate("items.itemId", "name")
      .sort({ billingDate: 1, periodStart: 1 });

    if (billings.length !== ids.length) {
      throw new Error("Um ou mais fechamentos não foram encontrados");
    }

    const customerId = billings[0].customerId.toString();
    for (const b of billings) {
      if (b.customerId.toString() !== customerId) {
        throw new Error("Todos os fechamentos devem ser do mesmo cliente");
      }
    }

    const rentalId = billings[0].rentalId;

    const items: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }> = [];

    for (const bill of billings) {
      for (const line of bill.items || []) {
        const itemDoc = line.itemId as unknown as { name?: string } | mongoose.Types.ObjectId;
        const name =
          itemDoc && typeof itemDoc === "object" && "name" in itemDoc && itemDoc.name
            ? String(itemDoc.name)
            : "Item";
        items.push({
          description: name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          total: line.subtotal,
        });
      }

      for (const svc of bill.services || []) {
        items.push({
          description: String(svc.description || "Serviço"),
          quantity: svc.quantity,
          unitPrice: svc.price,
          total: svc.subtotal,
        });
      }

      if ((!bill.items || bill.items.length === 0) && (!bill.services || bill.services.length === 0)) {
        items.push({
          description: "Aluguel",
          quantity: 1,
          unitPrice: bill.calculation.total,
          total: bill.calculation.total,
        });
      }
    }

    if (items.length === 0) {
      throw new Error("Não há linhas para a fatura a partir dos fechamentos selecionados");
    }

    const subtotal = items.reduce((s, it) => s + it.total, 0);
    const tax = data.tax ?? 0;
    const discount = data.discount ?? 0;
    const total = subtotal + tax - discount;

    const issueDate = data.issueDate ? new Date(data.issueDate) : new Date();
    let dueDate: Date;
    if (data.dueDate) {
      dueDate = new Date(data.dueDate);
    } else {
      dueDate = new Date(issueDate);
      dueDate.setDate(dueDate.getDate() + 30);
    }

    const notesCombined = data.notes ? String(data.notes).trim() : "";

    const invoice = await Invoice.create({
      companyId,
      billingIds: ids,
      rentalId,
      customerId: billings[0].customerId,
      items,
      subtotal,
      tax,
      discount,
      total,
      status: "draft",
      issueDate,
      dueDate,
      terms: data.terms,
      notes: notesCombined,
      paymentMethod: data.paymentMethod || "boleto/PIX",
      obraDescription: data.obraDescription,
      createdBy: userId,
    });

    for (const billingId of ids) {
      await financialService.attachBillingToInvoice(billingId, invoice._id);
    }

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
    } = {},
  ): Promise<{
    invoices: IInvoice[];
    total: number;
    page: number;
    limit: number;
  }> {
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
        .populate("customerId", "name cpfCnpj email phone")
        .populate("rentalId", "rentalNumber")
        .populate("createdBy", "name email")
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
  async getInvoiceById(
    companyId: string,
    invoiceId: string,
  ): Promise<IInvoice | null> {
    return Invoice.findOne({ _id: invoiceId, companyId })
      .populate("customerId", "name cpfCnpj email phone address")
      .populate("rentalId")
      .populate("createdBy", "name email");
  }

  /**
   * Update invoice status
   */
  async updateInvoiceStatus(
    companyId: string,
    invoiceId: string,
    status: InvoiceStatus,
  ): Promise<IInvoice | null> {
    const invoice = await Invoice.findOne({ _id: invoiceId, companyId });

    if (!invoice) {
      throw new Error("Invoice not found");
    }

    invoice.status = status;

    if (status === "sent" && !invoice.sentAt) {
      invoice.sentAt = new Date();
    }

    if (status === "paid" && !invoice.paidDate) {
      invoice.paidDate = new Date();
    }

    await invoice.save();

    if (invoice.governsFinancialStatus && invoice.billingIds && invoice.billingIds.length > 0) {
      for (const billingId of invoice.billingIds) {
        if (status === "cancelled") {
          await Billing.updateOne(
            { _id: billingId, companyId, status: { $ne: "paid" } },
            { $set: { financialStage: "charge", governance: "charge", invoiceId: null } },
          );
        }
        if (status === "paid") {
          const bill = await Billing.findOne({ _id: billingId, companyId });
          if (!bill) continue;
          const remaining = bill.outstandingAmount ?? bill.calculation.total;
          await financialService.appendBillingPayment(billingId, {
            amount: remaining,
            paidAt: invoice.paidDate || new Date(),
            paymentMethod: invoice.paymentMethod,
            notes: `Baixa pela fatura ${invoice.invoiceNumber}`,
            origin: "invoice",
            originId: String(invoice._id),
          });
        }
      }
    }

    if (status === "paid") {
      await transactionService.createSystemIncomeFromSettlement(
        companyId,
        {
          amount: invoice.total,
          description: `Recebimento da fatura ${invoice.invoiceNumber}`,
          dueDate: invoice.dueDate,
          paidDate: invoice.paidDate || new Date(),
          relatedTo: { type: "other", id: new mongoose.Types.ObjectId(String(invoice._id)) },
          paymentMethod: invoice.paymentMethod,
        },
        String(invoice.createdBy),
      );
    }

    return invoice;
  }

  /**
   * Monta linhas do PDF com descrição limpa, período e tipo de cobrança (a partir dos fechamentos quando possível).
   */
  private async buildInvoicePdfRows(companyId: string, invoice: IInvoice): Promise<InvoicePdfRow[]> {
    const sourceItems = invoice.items || [];
    const zipWithLegacyStrip = (): InvoicePdfRow[] =>
      sourceItems.map((it) => {
        const period = extractPeriodFromLegacyInvoiceDescription(it.description);
        return {
          description: stripLegacyInvoiceDescription(it.description),
          period: period || "—",
          tipo: "—",
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          total: it.total,
        };
      });

    if (!invoice.billingIds?.length) {
      return zipWithLegacyStrip();
    }

    const ids = invoice.billingIds.map((id) => new mongoose.Types.ObjectId(String(id)));
    const billings = await Billing.find({
      _id: { $in: ids },
      companyId,
    })
      .populate("items.itemId", "name")
      .sort({ billingDate: 1, periodStart: 1 });

    if (billings.length !== ids.length) {
      return zipWithLegacyStrip();
    }

    const meta: Array<{ description: string; period: string; tipo: string }> = [];

    for (const bill of billings) {
      const periodLabel = `${new Date(bill.periodStart).toLocaleDateString("pt-BR")} a ${new Date(
        bill.periodEnd,
      ).toLocaleDateString("pt-BR")}`;
      const tipo =
        RENTAL_TYPE_PT_LABEL[String(bill.rentalType || "")] ||
        (bill.rentalType ? String(bill.rentalType) : "—");

      for (const line of bill.items || []) {
        const itemDoc = line.itemId as unknown as { name?: string } | mongoose.Types.ObjectId;
        const name =
          itemDoc && typeof itemDoc === "object" && "name" in itemDoc && itemDoc.name
            ? String(itemDoc.name)
            : "Item";
        meta.push({ description: name, period: periodLabel, tipo });
      }

      for (const svc of bill.services || []) {
        meta.push({
          description: String(svc.description || "Serviço"),
          period: periodLabel,
          tipo,
        });
      }

      if ((!bill.items || bill.items.length === 0) && (!bill.services || bill.services.length === 0)) {
        meta.push({ description: "Aluguel", period: periodLabel, tipo });
      }
    }

    if (meta.length !== sourceItems.length) {
      return zipWithLegacyStrip();
    }

    return sourceItems.map((it, i) => ({
      description: meta[i].description,
      period: meta[i].period,
      tipo: meta[i].tipo,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      total: it.total,
    }));
  }

  /**
   * PDF no layout "FATURA" (A4, referência planilha FATURA.xlsx)
   */
  async generateInvoicePDF(
    companyId: string,
    invoiceId: string,
  ): Promise<Buffer> {
    const invoice = await Invoice.findOne({ _id: invoiceId, companyId })
      .populate("customerId")
      .populate("rentalId")
      .populate("companyId");

    if (!invoice) {
      throw new Error("Invoice not found");
    }

    let contractNumbersDisplay: string | null = null;
    if (invoice.billingIds && invoice.billingIds.length > 0) {
      const billsForContract = await Billing.find({
        _id: { $in: invoice.billingIds },
        companyId,
      }).populate("rentalId", "rentalNumber");
      const nums = billsForContract
        .map((b) => {
          const r = b.rentalId as { rentalNumber?: string } | null;
          return r?.rentalNumber;
        })
        .filter((x): x is string => !!x);
      if (nums.length > 0) {
        contractNumbersDisplay = [...new Set(nums)].join(", ");
      }
    }

    const company = invoice.companyId as any;
    const customer = invoice.customerId as any;
    const rental = invoice.rentalId as any;
    const settings = (company?.settings || {}) as Record<string, unknown>;

    const fmtMoney = (n: number) =>
      new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

    const customerAddress = () => {
      const customerAddresses = customer?.addresses || [];
      const preferred =
        customerAddresses.find((addr: any) => addr.type === "billing") ||
        customerAddresses.find((addr: any) => addr.type === "main") ||
        customerAddresses[0];
      if (!preferred) return { line1: "", line2: "" };
      const line1 = [preferred.street, preferred.number ? `, ${preferred.number}` : ""].join("");
      const complement = preferred.complement ? ` — ${preferred.complement}` : "";
      const bairro = preferred.neighborhood ? ` — ${preferred.neighborhood}` : "";
      const line2 = `${preferred.city || ""}/${preferred.state || ""} — CEP ${preferred.zipCode || ""}`;
      return { line1: line1 + complement + bairro, line2 };
    };

    const obraFromRental = () => {
      if (invoice.obraDescription) return invoice.obraDescription;
      const w = rental?.workAddress;
      if (!w) return "";
      const parts = [w.street, w.number, w.neighborhood, w.city && w.state ? `${w.city}/${w.state}` : ""].filter(
        Boolean,
      );
      return parts.join(", ");
    };

    const rentalLabel = () => {
      if (contractNumbersDisplay) return contractNumbersDisplay;
      if (!rental) return "—";
      return rental.rentalNumber || String(rental._id).slice(-8);
    };

    const paymentMethod = invoice.paymentMethod || "boleto/PIX";
    const custAddr = customerAddress();
    const customerCode =
      customer?._id != null ? String(customer._id).slice(-6).toUpperCase() : "—";

    const pdfRows = await this.buildInvoicePdfRows(companyId, invoice);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 36, size: "A4" });
      const chunks: Buffer[] = [];
      const pageW = 595 - 72;
      const left = 36;
      const right = left + pageW;

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const headerTop = 36;
      const logoPath = resolveInvoiceLogoPath();
      const colLeftW = 102;
      const colCenterX = left + colLeftW + 8;
      const colCenterW = 218;
      const colRightX = colCenterX + colCenterW + 12;
      const colRightW = Math.max(120, right - colRightX);

      let yAfterHeader = headerTop;

      // Coluna esquerda: logo
      let logoBottom = headerTop;
      if (fs.existsSync(logoPath)) {
        try {
          doc.image(logoPath, left, headerTop, { width: 95 });
          logoBottom = headerTop + 72;
        } catch {
          logoBottom = headerTop + 4;
        }
      }

      // Coluna central: dados institucionais
      let cy = headerTop;
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#000000");
      doc.text(INVOICE_HEADER_BRAND_LINES[0], colCenterX, cy, {
        width: colCenterW,
        align: "center",
      });
      cy = doc.y + 3;
      doc.font("Helvetica").fontSize(7.5).fillColor("#333333");
      for (let i = 1; i < INVOICE_HEADER_BRAND_LINES.length; i++) {
        const line = INVOICE_HEADER_BRAND_LINES[i];
        doc.text(line, colCenterX, cy, { width: colCenterW, align: "center" });
        cy = doc.y + (line === "" ? 2 : 3);
      }
      doc.fillColor("#000000");
      const yCenterBottom = cy;

      // Coluna direita: título da fatura e numeração
      let ry = headerTop;
      doc.font("Helvetica-Bold").fontSize(12).text("FATURA DE LOCAÇÃO", colRightX, ry, {
        width: colRightW,
        align: "right",
      });
      ry = doc.y + 6;
      doc.font("Helvetica").fontSize(9);
      doc.text(`Número da Fatura: ${invoice.invoiceNumber}`, colRightX, ry, {
        width: colRightW,
        align: "right",
      });
      ry = doc.y + 5;
      doc.text(
        `Emissão: ${new Date(invoice.issueDate).toLocaleDateString("pt-BR")}`,
        colRightX,
        ry,
        { width: colRightW, align: "right" },
      );
      ry = doc.y + 5;
      doc.text(
        `Vencimento: ${new Date(invoice.dueDate).toLocaleDateString("pt-BR")}`,
        colRightX,
        ry,
        { width: colRightW, align: "right" },
      );
      ry = doc.y + 4;
      const yRightBottom = ry;

      yAfterHeader = Math.max(logoBottom, yCenterBottom, yRightBottom) + 10;

      let y = yAfterHeader;

      doc.moveTo(left, y).lineTo(right, y).stroke();
      y += 10;

      doc.font("Helvetica-Bold").fontSize(10).text("DESTINATÁRIO", left, y);
      y += 12;

      doc.font("Helvetica").fontSize(8.5);
      doc.text(`COD. ${customerCode}`, left, y);
      y += 11;
      doc.text(`Razão Social / Nome: ${customer?.name || "—"}`, left, y);
      y += 11;
      if (customer?.cpfCnpj) {
        doc.text(`CNPJ / CPF: ${customer.cpfCnpj}`, left, y);
        y += 11;
      }
      if (custAddr.line1) {
        doc.text(`Endereço: ${custAddr.line1}`, left, y);
        y += 11;
      }
      if (custAddr.line2) {
        doc.text(custAddr.line2, left, y);
        y += 11;
      }
      if (customer?.phone) {
        doc.text(`Telefone: ${customer.phone}`, left, y);
        y += 11;
      }
      y += 8;

      doc.font("Helvetica-Bold").fontSize(9).text("CONTRATO", left, y);
      doc.text("PAGAMENTO", left + 260, y);
      y += 12;
      doc.font("Helvetica").fontSize(8.5);
      doc.text(`Número: ${rentalLabel()}`, left, y);
      doc.text(`Forma de Pagamento: ${paymentMethod}`, left + 260, y);
      y += 16;

      if (invoice.notes) {
        doc.font("Helvetica-Bold").fontSize(8).text("OBSERVAÇÃO:", left, y);
        y += 10;
        doc.font("Helvetica").fontSize(7.5).text(invoice.notes, left, y, { width: pageW });
        y = doc.y + 8;
      }

      const obra = obraFromRental();
      if (obra) {
        doc.font("Helvetica-Bold").fontSize(8).text("OBRA:", left, y);
        y += 10;
        doc.font("Helvetica").fontSize(7.5).text(obra, left, y, { width: pageW });
        y = doc.y + 10;
      }

      y += 4;
      doc.moveTo(left, y).lineTo(right, y).stroke();
      y += 8;

      const colDesc = left;
      const descW = 115;
      const colPeriod = colDesc + descW + 3;
      const periodW = 90;
      const colTipo = colPeriod + periodW + 3;
      const tipoW = 44;
      const colQ = colTipo + tipoW + 4;
      const colVu = colQ + 22;
      const vuW = 54;
      const colTot = colVu + vuW + 4;
      const totW = 54;
      const colFp = colTot + totW + 6;

      doc.font("Helvetica-Bold").fontSize(7.5);
      doc.text("DESCRIÇÃO DA LOCAÇÃO", colDesc, y);
      doc.text("PERÍODO", colPeriod, y);
      doc.text("TIPO COBR.", colTipo, y);
      doc.text("Qtd", colQ, y);
      doc.text("V. Unit.", colVu, y, { width: vuW, align: "right" });
      doc.text("V. Total", colTot, y, { width: totW, align: "right" });
      doc.text("Forma Pgto", colFp, y, { width: right - colFp, align: "right" });
      y += 14;

      doc.font("Helvetica").fontSize(7.5);
      for (const row of pdfRows) {
        const hDesc = doc.heightOfString(row.description, { width: descW });
        const hPeriod = doc.heightOfString(row.period, { width: periodW });
        const rowH = Math.max(14, hDesc + 2, hPeriod + 2);
        if (y + rowH > 750) {
          doc.addPage();
          y = 36;
        }
        doc.text(row.description, colDesc, y, { width: descW });
        doc.text(row.period, colPeriod, y, { width: periodW });
        doc.text(row.tipo, colTipo, y, { width: tipoW });
        doc.text(String(row.quantity), colQ, y);
        doc.text(fmtMoney(row.unitPrice), colVu, y, { width: vuW, align: "right" });
        doc.text(fmtMoney(row.total), colTot, y, { width: totW, align: "right" });
        doc.text(paymentMethod, colFp, y, { width: right - colFp, align: "right" });
        y += rowH;
      }

      y += 8;
      doc.moveTo(left, y).lineTo(right, y).stroke();
      y += 10;

      doc.font("Helvetica").fontSize(8.5);
      doc.text("Subtotal:", colDesc, y, { width: colTot - colDesc - 8, align: "right" });
      doc.text(fmtMoney(invoice.subtotal), colTot, y, { width: 70, align: "right" });
      y += 12;

      if (invoice.discount && invoice.discount > 0) {
        doc.text("Desconto:", colDesc, y, { width: colTot - colDesc - 8, align: "right" });
        doc.text(`-${fmtMoney(invoice.discount)}`, colTot, y, { width: 70, align: "right" });
        y += 12;
      }
      if (invoice.tax && invoice.tax > 0) {
        doc.text("Impostos/Taxas:", colDesc, y, { width: colTot - colDesc - 8, align: "right" });
        doc.text(`+${fmtMoney(invoice.tax)}`, colTot, y, { width: 70, align: "right" });
        y += 12;
      }

      y += 4;
      doc.font("Helvetica-Bold").fontSize(9);
      doc.text("Valor Total da Fatura:", colDesc, y, {
        width: colTot - colDesc - 8,
        align: "right",
      });
      doc.text(fmtMoney(invoice.total), colTot, y, { width: 70, align: "right" });
      y += 16;

      y += 6;
      doc.font("Helvetica").fontSize(7).fillColor("#222222");
      const issText = typeof settings.invoiceIssNote === "string" ? settings.invoiceIssNote : ISS_MUNICIPAL_NOTE;
      doc.text(issText, left, y, { width: pageW, align: "justify" });
      y = doc.y + 12;

      if (y > 620) {
        doc.addPage();
        y = 36;
      }

      const midSplit = left + pageW / 2;
      const leftColW = midSplit - left - 12;
      const rightColX = midSplit + 12;
      const rightColW = right - rightColX;
      const footerTop = y;

      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#000000");
      doc.text("Forma de Pagamento", left, footerTop);
      doc.font("Helvetica").fontSize(8).fillColor("#000000");
      doc.text(INVOICE_FOOTER_PIX, left, footerTop + 14, { width: leftColW });
      const yLeft = doc.y + 8;

      const sicoobPath = resolveSicoobLogoPath();
      let yRight = footerTop;
      if (fs.existsSync(sicoobPath)) {
        try {
          doc.image(sicoobPath, rightColX, footerTop, { width: 72 });
          yRight = footerTop + 50;
        } catch {
          yRight = footerTop;
        }
      }
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#000000");
      doc.text("Dados Bancários", rightColX, footerTop);
      doc.font("Helvetica").fontSize(7.5);
      for (const line of INVOICE_FOOTER_BANK_LINES) {
        doc.text(line, rightColX, yRight, { width: rightColW });
        yRight = doc.y + 2;
      }

      y = Math.max(yLeft, yRight) + 12;

      if (typeof settings.invoiceBankInfo === "string" && settings.invoiceBankInfo.trim()) {
        doc.font("Helvetica").fontSize(7).fillColor("#333333");
        doc.text(settings.invoiceBankInfo, left, y, { width: pageW });
        y = doc.y + 8;
        doc.fillColor("#000000");
      }

      if (invoice.terms) {
        doc.font("Helvetica-Bold").fontSize(7).text("Termos:", left, y);
        y += 9;
        doc.font("Helvetica").text(invoice.terms, left, y, { width: pageW });
        y = doc.y + 8;
      }

      doc.fillColor("#000000");
      y += 10;
      if (y > 700) {
        doc.addPage();
        y = 36;
      }
      doc.font("Helvetica-Bold").fontSize(8).text("RECEBI(EMOS) AS LOCAÇÕES CONSTANTES NESTA FATURA", left, y, {
        width: pageW,
      });
      y += 20;
      doc.moveTo(left, y).lineTo(right, y).stroke();
      y += 20;

      const sigBlankW = 70;
      const sigRightW = 105;
      const sigMidX = left + sigBlankW + 12;
      const sigMidW = pageW - sigBlankW - sigRightW - 24;
      const sigRightX = left + pageW - sigRightW;
      const sigRowY = y;

      // Coluna esquerda: em branco (reserva de espaço)
      // Coluna central (maior): rótulo + linha de assinatura
      doc.font("Helvetica").fontSize(8).fillColor("#000000");
      doc.text("Identificação e assinatura do recebedor", sigMidX, sigRowY, {
        width: sigMidW,
        align: "center",
      });
      const lineY = sigRowY + 14;
      doc.moveTo(sigMidX, lineY).lineTo(sigMidX + sigMidW, lineY).strokeColor("#000000").stroke();

      // Coluna direita: número da fatura
      doc.font("Helvetica-Bold").fontSize(8).text(`Nº ${invoice.invoiceNumber}`, sigRightX, sigRowY, {
        width: sigRightW,
        align: "right",
      });

      y = lineY + 16;

      doc.end();
    });
  }

  /**
   * Update invoice
   */
  async updateInvoice(
    companyId: string,
    invoiceId: string,
    data: any,
  ): Promise<IInvoice | null> {
    const invoice = await Invoice.findOne({ _id: invoiceId, companyId });

    if (!invoice) {
      throw new Error("Invoice not found");
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
