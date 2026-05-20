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
import { normalizeDocument, isValidCnpj, formatCnpjForDisplay } from "../../shared/utils/document.utils";
import { allocateNextInvoiceSequenceNumber } from "./invoice.sequence.util";
import { mergeInvoiceIssuerFilter } from "./invoiceIssuerQuery.util";
import {
  getBillingCompositionRowsOrdered,
  isBillingFreteLine,
  sortBillingDocumentsFreteClosureGroupLastStable,
  sortBillingRowsFreteLastStable,
} from "../../shared/utils/billing-display-order.util";
import {
  formatDateBrNoTimezoneShift,
  parseCalendarDate,
} from "../../shared/utils/date-display.util";
import { formatCurrencyBr } from "../../shared/utils/money-display.util";

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

/**
 * Cada segmento corresponde a um fechamento na ordem de `billingIds`.
 * Dentro do segmento, coloca valores de linhas não-frete antes das de frete (estável),
 * alinhando com `meta` já montada com `getBillingCompositionRowsOrdered`.
 */
function alignInvoiceLineAmountsOrderForBillingPdfSegments(
  sourceItems: IInvoice["items"],
  segmentSizes: number[],
): IInvoice["items"] | null {
  const sumSeg = segmentSizes.reduce((s, n) => s + n, 0);
  if (sumSeg !== sourceItems.length || segmentSizes.length === 0) {
    return null;
  }
  let offset = 0;
  const out: IInvoice["items"] = [];
  for (const sz of segmentSizes) {
    const slice = sourceItems.slice(offset, offset + sz);
    offset += sz;
    out.push(
      ...sortBillingRowsFreteLastStable(slice, (it) => isBillingFreteLine(it.description)),
    );
  }
  return out;
}

function fallbackHeaderCnpjDisplay(): string {
  const last = INVOICE_HEADER_BRAND_LINES[INVOICE_HEADER_BRAND_LINES.length - 1];
  return last.replace(/^CNPJ\s*/i, "").trim();
}

function issuerCnpjDisplayForPdf(invoice: IInvoice, company: { cnpj?: string } | null): string {
  const fromInvoice = invoice.issuerCnpj ? normalizeDocument(String(invoice.issuerCnpj)) : "";
  if (fromInvoice.length === 14 && isValidCnpj(fromInvoice)) {
    return formatCnpjForDisplay(fromInvoice);
  }
  const fromCompany = company?.cnpj ? normalizeDocument(String(company.cnpj)) : "";
  if (fromCompany.length === 14 && isValidCnpj(fromCompany)) {
    return formatCnpjForDisplay(fromCompany);
  }
  return fallbackHeaderCnpjDisplay();
}

function isInvoiceDupKey(err: unknown): boolean {
  const e = err as { code?: number; keyPattern?: Record<string, number> };
  return Boolean(
    e?.code === 11000 &&
      e?.keyPattern &&
      typeof e.keyPattern === "object" &&
      "invoiceNumber" in e.keyPattern &&
      "companyId" in e.keyPattern,
  );
}

async function ensureInvoiceIssuersIfEmptyCompanyDoc(companyId: string): Promise<void> {
  const company = await Company.findById(companyId).select("invoiceIssuers cnpj");
  if (!company) throw new Error("Company not found");
  const cleanMain = company.cnpj ? normalizeDocument(String(company.cnpj)) : "";
  if (
    (!company.invoiceIssuers || company.invoiceIssuers.length === 0) &&
    cleanMain.length === 14 &&
    isValidCnpj(cleanMain)
  ) {
    company.invoiceIssuers = [{ label: "Matriz", cnpj: cleanMain } as any];
    await company.save();
  }
}

async function resolveIssuerFieldsOrThrow(
  companyId: string,
  billingIssuerIdInput?: string,
): Promise<{
  billingIssuerId?: mongoose.Types.ObjectId;
  issuerCnpj?: string;
  issuerLabel?: string;
  /** Ausente apenas no fluxo legado sem emitentes cadastrados. */
  initialInvoiceNumber?: number;
}> {
  await ensureInvoiceIssuersIfEmptyCompanyDoc(companyId);
  const company = await Company.findById(companyId).select("invoiceIssuers").orFail();
  const issuers = (company.invoiceIssuers || []) as any[];

  if (issuers.length === 0) {
    if (billingIssuerIdInput?.trim()) {
      throw new Error("Cadastre emissores de fatura (CNPJ) na empresa antes de escolher o emitente.");
    }
    return {};
  }

  if (!billingIssuerIdInput?.trim()) {
    throw new Error("Selecione o CNPJ emissor da fatura.");
  }

  const sub = issuers.find((x: any) => String(x._id) === billingIssuerIdInput.trim());
  if (!sub) {
    throw new Error("Emitente de fatura inválido.");
  }
  const issuerCnpj = normalizeDocument(String(sub.cnpj || ""));
  if (issuerCnpj.length !== 14 || !isValidCnpj(issuerCnpj)) {
    throw new Error("CNPJ do emissor é inválido.");
  }
  const rawMin = sub.initialInvoiceNumber as unknown;
  const initialInvoiceNumber =
    typeof rawMin === "number" && Number.isFinite(rawMin) && rawMin >= 1
      ? Math.floor(rawMin)
      : 1;

  return {
    billingIssuerId: sub._id as mongoose.Types.ObjectId,
    issuerCnpj,
    issuerLabel: String(sub.label || "").trim() || "Matriz",
    initialInvoiceNumber,
  };
}

async function createInvoiceWithSequenceRetry(
  fields: Record<string, unknown>,
  options?: { fixedInvoiceNumber?: string; sequenceStartMin?: number },
): Promise<IInvoice> {
  const companyOid = fields.companyId as mongoose.Types.ObjectId;
  const billingIssuerOid =
    fields.billingIssuerId != null && fields.billingIssuerId !== undefined
      ? (fields.billingIssuerId as mongoose.Types.ObjectId)
      : null;

  let lastErr: unknown;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    try {
      const invoiceNumber =
        options?.fixedInvoiceNumber ||
        (await allocateNextInvoiceSequenceNumber(
          companyOid,
          billingIssuerOid || undefined,
          options?.sequenceStartMin ?? 1,
        ));

      const created = await Invoice.create({ ...fields, invoiceNumber });
      return created;
    } catch (err: unknown) {
      lastErr = err;
      if (options?.fixedInvoiceNumber) throw err;
      if (isInvoiceDupKey(err)) continue;
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Não foi possível gerar número único de fatura.");
}

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
      billingIssuerId?: string;
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

    const companyOid = new mongoose.Types.ObjectId(companyId);
    const issuer = await resolveIssuerFieldsOrThrow(companyId, options?.billingIssuerId);

    const invoice = await createInvoiceWithSequenceRetry(
      {
        companyId: companyOid,
        ...(issuer.billingIssuerId ? { billingIssuerId: issuer.billingIssuerId } : {}),
        ...(issuer.issuerCnpj ? { issuerCnpj: issuer.issuerCnpj } : {}),
        ...(issuer.issuerLabel ? { issuerLabel: issuer.issuerLabel } : {}),
        rentalId: rental._id,
        customerId:
          typeof rental.customerId === "object"
            ? (rental.customerId as any)._id
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
      },
      { sequenceStartMin: issuer.initialInvoiceNumber ?? 1 },
    );

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
      billingIssuerId?: string;
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
    const billingsFetched = await Billing.find({
      _id: { $in: ids },
      companyId,
    }).populate("items.itemId", "name");

    if (billingsFetched.length !== ids.length) {
      throw new Error("Um ou mais fechamentos não foram encontrados");
    }

    const itemDisplayNameForBilling = (line: any): string => {
      const itemDoc = line.itemId as unknown as { name?: string } | mongoose.Types.ObjectId;
      return itemDoc &&
        typeof itemDoc === "object" &&
        "name" in itemDoc &&
        itemDoc.name
        ? String(itemDoc.name)
        : "Item";
    };

    const billings = sortBillingDocumentsFreteClosureGroupLastStable(
      billingsFetched,
      itemDisplayNameForBilling,
    );

    const customerId = billings[0].customerId.toString();
    for (const b of billings) {
      if (b.customerId.toString() !== customerId) {
        throw new Error("Todos os fechamentos devem ser do mesmo cliente");
      }
      if (b.invoiceId) {
        throw new Error("Fechamento já está vinculado a uma fatura");
      }
      if (b.status === "cancelled") {
        throw new Error("Fechamento cancelado não pode ser faturado");
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
      const billingTotal = Number(bill.calculation?.total || 0);
      const billingOutstanding = Number(bill.outstandingAmount ?? billingTotal);
      /** Quitado: emite NF pelo valor do fechamento (total), não pelo saldo zerado. */
      const basisForInvoice =
        billingOutstanding > 0.01 ? billingOutstanding : billingTotal;
      if (basisForInvoice <= 0.01) {
        throw new Error(
          `Fechamento ${bill.billingNumber} não possui valor para compor a fatura`,
        );
      }
      const grossLinesTotal =
        [...(bill.items || []), ...(bill.services || [])].reduce(
          (sum: number, line: any) => sum + Number(line.subtotal || 0),
          0,
        ) || billingTotal;
      const scale = grossLinesTotal > 0 ? basisForInvoice / grossLinesTotal : 1;

      const orderedBillRows = getBillingCompositionRowsOrdered(bill, itemDisplayNameForBilling);

      for (const row of orderedBillRows) {
        if (row.kind === "item") {
          const line = row.line as any;
          items.push({
            description: itemDisplayNameForBilling(line),
            quantity: line.quantity,
            unitPrice: Number((line.unitPrice * scale).toFixed(2)),
            total: Number((line.subtotal * scale).toFixed(2)),
          });
        } else {
          const svc = row.svc as any;
          items.push({
            description: String(svc.description || "Serviço"),
            quantity: svc.quantity,
            unitPrice: Number((svc.price * scale).toFixed(2)),
            total: Number((svc.subtotal * scale).toFixed(2)),
          });
        }
      }

      if ((!bill.items || bill.items.length === 0) && (!bill.services || bill.services.length === 0)) {
        items.push({
          description: "Aluguel",
          quantity: 1,
          unitPrice: basisForInvoice,
          total: basisForInvoice,
        });
      }
    }

    if (items.length === 0) {
      throw new Error("Não há linhas para a fatura a partir dos fechamentos selecionados");
    }

    const subtotal = Number(items.reduce((s, it) => s + it.total, 0).toFixed(2));
    const tax = data.tax ?? 0;
    const discount = data.discount ?? 0;
    const total = Math.max(0, Number((subtotal + tax - discount).toFixed(2)));

    const issueDate = data.issueDate
      ? parseCalendarDate(data.issueDate) ?? new Date(data.issueDate)
      : new Date();
    let dueDate: Date;
    if (data.dueDate) {
      dueDate = parseCalendarDate(data.dueDate) ?? new Date(data.dueDate);
    } else {
      dueDate = new Date(issueDate);
      dueDate.setDate(dueDate.getDate() + 30);
    }

    const notesCombined = data.notes ? String(data.notes).trim() : "";

    const companyOid = new mongoose.Types.ObjectId(companyId);
    const issuer = await resolveIssuerFieldsOrThrow(companyId, data.billingIssuerId);

    /** Ordem gravada nas linhas / PDF: sem frete → com frete; dentro de cada faixa, cronológico. */
    const billingIdsEmissionOrder = billings.map((b) => b._id as mongoose.Types.ObjectId);

    const invoice = await createInvoiceWithSequenceRetry(
      {
        companyId: companyOid,
        ...(issuer.billingIssuerId ? { billingIssuerId: issuer.billingIssuerId } : {}),
        ...(issuer.issuerCnpj ? { issuerCnpj: issuer.issuerCnpj } : {}),
        ...(issuer.issuerLabel ? { issuerLabel: issuer.issuerLabel } : {}),
        billingIds: billingIdsEmissionOrder,
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
      },
      { sequenceStartMin: issuer.initialInvoiceNumber ?? 1 },
    );

    for (const billingId of billingIdsEmissionOrder) {
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
      billingIssuerId?: string;
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

    mergeInvoiceIssuerFilter(query, filters.billingIssuerId);

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
      const payableBillings =
        status === "paid"
          ? await Billing.find({
              _id: { $in: invoice.billingIds },
              companyId,
            })
          : [];
      const totalOutstanding = payableBillings.reduce(
        (sum, bill) => sum + Number(bill.outstandingAmount ?? bill.calculation.total ?? 0),
        0,
      );
      const cashToAllocate = Math.min(Number(invoice.total || 0), totalOutstanding);

      for (const billingId of invoice.billingIds) {
        if (status === "cancelled") {
          await Billing.updateOne(
            { _id: billingId, companyId, status: { $ne: "paid" } },
            { $set: { financialStage: "charge", governance: "charge", invoiceId: null } },
          );
        }
        if (status === "paid") {
          const bill =
            payableBillings.find((candidate) => String(candidate._id) === String(billingId)) ||
            (await Billing.findOne({ _id: billingId, companyId }));
          if (!bill) continue;
          const remaining = Number(bill.outstandingAmount ?? bill.calculation.total);
          if (remaining <= 0) continue;
          const amount =
            totalOutstanding > 0
              ? Number(((remaining / totalOutstanding) * cashToAllocate).toFixed(2))
              : remaining;
          const discount = Number((remaining - amount).toFixed(2));
          await financialService.appendBillingPayment(billingId, {
            amount,
            discount,
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
    const fetchedBillings = await Billing.find({
      _id: { $in: ids },
      companyId,
    }).populate("items.itemId", "name");

    if (fetchedBillings.length !== ids.length) {
      return zipWithLegacyStrip();
    }

    const idPos = new Map(ids.map((oid, i) => [String(oid), i]));
    const billings = [...fetchedBillings].sort((a, b) => {
      const ia = idPos.get(String(a._id));
      const ib = idPos.get(String(b._id));
      return (ia ?? 9999) - (ib ?? 9999);
    });

    const meta: Array<{ description: string; period: string; tipo: string }> = [];
    const segmentSizes: number[] = [];

    for (const bill of billings) {
      const periodLabel = `${formatDateBrNoTimezoneShift(bill.periodStart)} a ${formatDateBrNoTimezoneShift(
        bill.periodEnd,
      )}`;
      const tipo =
        RENTAL_TYPE_PT_LABEL[String(bill.rentalType || "")] ||
        (bill.rentalType ? String(bill.rentalType) : "—");

      const invoiceMetaItemName = (line: any): string => {
        const itemDoc = line.itemId as unknown as { name?: string } | mongoose.Types.ObjectId;
        return itemDoc &&
          typeof itemDoc === "object" &&
          "name" in itemDoc &&
          itemDoc.name
          ? String(itemDoc.name)
          : "Item";
      };

      const orderedPdfMetaRows = getBillingCompositionRowsOrdered(bill, invoiceMetaItemName);

      let segmentCount = 0;

      for (const row of orderedPdfMetaRows) {
        if (row.kind === "item") {
          meta.push({
            description: invoiceMetaItemName(row.line),
            period: periodLabel,
            tipo,
          });
        } else {
          const svc = row.svc as { description?: string };
          meta.push({
            description: String(svc.description || "Serviço"),
            period: periodLabel,
            tipo,
          });
        }
        segmentCount++;
      }

      if ((!bill.items || bill.items.length === 0) && (!bill.services || bill.services.length === 0)) {
        meta.push({ description: "Aluguel", period: periodLabel, tipo });
        segmentCount++;
      }

      segmentSizes.push(segmentCount);
    }

    if (meta.length !== sourceItems.length) {
      return zipWithLegacyStrip();
    }

    let itemsForPdf = alignInvoiceLineAmountsOrderForBillingPdfSegments(sourceItems, segmentSizes);
    if (!itemsForPdf && billings.length === 1) {
      itemsForPdf = sortBillingRowsFreteLastStable([...sourceItems], (it) =>
        isBillingFreteLine(it.description),
      );
    }
    if (!itemsForPdf) {
      itemsForPdf = [...sourceItems];
    }

    return itemsForPdf.map((it, i) => ({
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

    const fmtMoney = formatCurrencyBr;

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

    const issuerDisplay = issuerCnpjDisplayForPdf(invoice, company);
    const headerBrandLines = [...INVOICE_HEADER_BRAND_LINES.slice(0, -1), `CNPJ ${issuerDisplay}`];
    const footerPixLine = `Chave PIX: CNPJ ${issuerDisplay}`;

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
      doc.text(headerBrandLines[0], colCenterX, cy, {
        width: colCenterW,
        align: "center",
      });
      cy = doc.y + 3;
      doc.font("Helvetica").fontSize(7.5).fillColor("#333333");
      for (let i = 1; i < headerBrandLines.length; i++) {
        const line = headerBrandLines[i];
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
        `Emissão: ${formatDateBrNoTimezoneShift(invoice.issueDate)}`,
        colRightX,
        ry,
        { width: colRightW, align: "right" },
      );
      ry = doc.y + 5;
      doc.text(
        `Vencimento: ${formatDateBrNoTimezoneShift(invoice.dueDate)}`,
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
      doc.text(footerPixLine, left, footerTop + 14, { width: leftColW });
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
