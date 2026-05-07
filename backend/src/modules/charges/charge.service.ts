import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import PDFDocument from "pdfkit";
import { Billing } from "../billings/billing.model";
import { Charge } from "./charge.model";
import { ICharge } from "./charge.types";
import { financialService } from "../financial/financial.service";
import { transactionService } from "../transactions/transaction.service";

const DOC_HEADER_BRAND_LINES = [
  "ALUGUE EQUIPAMENTOS PARA CONSTRUÇÃO CIVIL",
  "",
  "AV. GOV. VALADARES, 2586 - JD. SÃO CARLOS,",
  "CEP 37137-254 - ALFENAS - MG",
  "TEL. (35) 9 8843-5154 / (35) 9 99761-2424",
  "",
  "CNPJ 28.408.479/0001-19",
];

const DOC_FOOTER_PIX = "Chave PIX: CNPJ 28.408.479/0001-19";
const DOC_FOOTER_BANK_LINES = [
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

function resolveInvoiceLogoPath(): string {
  return path.join(__dirname, "../../shared/imagens/alugue.png");
}

function resolveSicoobLogoPath(): string {
  return path.join(__dirname, "../../shared/imagens/sicoob.png");
}

class ChargeService {
  async createCharge(
    companyId: string,
    userId: string,
    data: { billingIds: string[]; dueDate?: Date; notes?: string; totalOverride?: number },
  ): Promise<ICharge> {
    let billingIds = [...new Set(data.billingIds)].map((id) => new mongoose.Types.ObjectId(id));
    let billings = await Billing.find({ _id: { $in: billingIds }, companyId });

    if (billings.length !== billingIds.length) {
      throw new Error("Um ou mais fechamentos não foram encontrados");
    }

    const rentalIds = [
      ...new Set(billings.map((billing) => String(billing.rentalId)).filter(Boolean)),
    ];
    if (rentalIds.length > 0) {
      const alreadySelected = new Set(billingIds.map((id) => String(id)));
      const serviceBillings = await Billing.find({
        companyId,
        rentalId: { $in: rentalIds.map((id) => new mongoose.Types.ObjectId(id)) },
        status: { $nin: ["paid", "cancelled"] },
        chargeId: null,
        invoiceId: null,
        "services.0": { $exists: true },
        items: { $size: 0 },
      });
      const eligibleServiceBillings = serviceBillings.filter((billing) => {
        const outstanding = Number(billing.outstandingAmount ?? billing.calculation?.total ?? 0);
        return !alreadySelected.has(String(billing._id)) && outstanding > 0.01;
      });
      if (eligibleServiceBillings.length > 0) {
        billingIds = [
          ...billingIds,
          ...eligibleServiceBillings.map((billing) => billing._id as mongoose.Types.ObjectId),
        ];
        billings = [...billings, ...eligibleServiceBillings];
      }
    }

    const customerId = String(billings[0].customerId);
    for (const bill of billings) {
      if (String(bill.customerId) !== customerId) {
        throw new Error("Todos os fechamentos devem ser do mesmo cliente");
      }
      const outstanding = Number(bill.outstandingAmount ?? bill.calculation?.total ?? 0);
      if (bill.status === "paid" || bill.status === "cancelled" || outstanding <= 0.01) {
        throw new Error("Fechamento não está elegível para cobrança");
      }
      if (bill.chargeId || bill.invoiceId) {
        throw new Error("Fechamento já está em cobrança/fatura e não pode ser reutilizado");
      }
    }

    const total = data.totalOverride ?? billings.reduce((acc, b) => acc + (b.outstandingAmount ?? b.calculation.total), 0);

    const charge = await Charge.create({
      companyId,
      customerId: billings[0].customerId,
      billingIds,
      dueDate: data.dueDate,
      total,
      outstandingAmount: total,
      notes: data.notes,
      createdBy: userId,
    });

    for (const billing of billings) {
      await financialService.attachBillingToCharge(billing._id, charge._id);
    }

    return charge;
  }

  async getCharges(companyId: string) {
    return Charge.find({ companyId })
      .populate("customerId")
      .populate("billingIds")
      .sort({ createdAt: -1 });
  }

  async applyPayment(
    companyId: string,
    chargeId: string,
    userId: string,
    data: { amount: number; discount?: number; paymentMethod?: string; notes?: string; paidAt?: Date },
  ) {
    const charge = await Charge.findOne({ _id: chargeId, companyId });
    if (!charge) {
      throw new Error("Cobrança não encontrada");
    }
    if (charge.status === "cancelled" || charge.status === "paid") {
      throw new Error("Cobrança não permite novas baixas");
    }

    const paidAt = data.paidAt || new Date();
    const amount = Number(data.amount || 0);
    const discount = Number(data.discount || 0);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error("Valor da baixa inválido");
    }
    if (!Number.isFinite(discount) || discount < 0) {
      throw new Error("Valor do desconto inválido");
    }

    const net = Number((amount + discount).toFixed(2));
    if (net <= 0) {
      throw new Error("Informe um valor de baixa ou desconto maior que zero");
    }
    const chargeOutstanding = Number(charge.outstandingAmount || 0);
    if (net - chargeOutstanding > 0.01) {
      throw new Error("Valor da baixa/desconto não pode exceder o saldo da cobrança");
    }

    const billings = await Billing.find({
      _id: { $in: charge.billingIds },
      companyId,
      status: { $ne: "cancelled" },
    }).sort({ billingDate: 1, billingNumber: 1, _id: 1 });

    const allocations: Array<{
      billingId: mongoose.Types.ObjectId;
      amount: number;
      discount: number;
    }> = [];
    let remainingNet = net;
    let remainingAmount = amount;
    let remainingDiscount = discount;

    for (const billing of billings) {
      if (remainingNet <= 0.01) break;
      const billingOutstanding = Number(
        billing.outstandingAmount ?? billing.calculation?.total ?? 0,
      );
      if (billingOutstanding <= 0) continue;

      const allocationNet = Number(
        Math.min(remainingNet, billingOutstanding).toFixed(2),
      );
      const amountShare =
        remainingNet <= allocationNet
          ? remainingAmount
          : Number(Math.min(remainingAmount, (allocationNet * amount) / net).toFixed(2));
      const discountShare = Number((allocationNet - amountShare).toFixed(2));

      allocations.push({
        billingId: billing._id,
        amount: amountShare,
        discount: discountShare,
      });

      remainingNet = Number((remainingNet - allocationNet).toFixed(2));
      remainingAmount = Number((remainingAmount - amountShare).toFixed(2));
      remainingDiscount = Number((remainingDiscount - discountShare).toFixed(2));
    }

    if (remainingNet > 0.01) {
      throw new Error("Os fechamentos vinculados não possuem saldo suficiente para a baixa");
    }

    if (remainingAmount > 0.01 || remainingDiscount > 0.01) {
      const lastAllocation = allocations[allocations.length - 1];
      if (lastAllocation) {
        lastAllocation.amount = Number((lastAllocation.amount + remainingAmount).toFixed(2));
        lastAllocation.discount = Number((lastAllocation.discount + remainingDiscount).toFixed(2));
      }
    }

    charge.paidAmount += amount;
    const nextChargeOutstanding = Math.max(0, Number((chargeOutstanding - net).toFixed(2)));
    charge.outstandingAmount = nextChargeOutstanding <= 0.01 ? 0 : nextChargeOutstanding;
    charge.status = charge.outstandingAmount === 0 ? "paid" : "partial";
    charge.payments.push({
      amount,
      discount,
      paidAt,
      paymentMethod: data.paymentMethod,
      notes: data.notes,
      createdBy: new mongoose.Types.ObjectId(userId),
    });
    await charge.save();

    for (const allocation of allocations) {
      await financialService.appendBillingPayment(allocation.billingId, {
        amount: allocation.amount,
        discount: allocation.discount,
        paidAt,
        paymentMethod: data.paymentMethod,
        notes: data.notes,
        origin: "charge",
        originId: String(charge._id),
        createdBy: userId,
      });
    }

    await transactionService.createSystemIncomeFromSettlement(companyId, {
      amount,
      description: `Recebimento da cobrança ${charge.chargeNumber}`,
      dueDate: charge.dueDate,
      paidDate: paidAt,
      relatedTo: { type: "other", id: new mongoose.Types.ObjectId(chargeId) },
      paymentMethod: data.paymentMethod,
    }, userId);

    return charge;
  }

  async cancelCharge(companyId: string, chargeId: string, isAdmin: boolean) {
    if (!isAdmin) {
      throw new Error("Apenas administrador pode cancelar cobrança");
    }

    const charge = await Charge.findOne({ _id: chargeId, companyId });
    if (!charge) throw new Error("Cobrança não encontrada");
    if (charge.status === "paid") throw new Error("Não é possível cancelar cobrança paga");

    charge.status = "cancelled";
    await charge.save();

    await Billing.updateMany(
      { _id: { $in: charge.billingIds }, companyId, status: { $ne: "paid" } },
      { $set: { chargeId: null, financialStage: "pending", governance: "charge" } },
    );

    return charge;
  }

  async updateCharge(
    companyId: string,
    chargeId: string,
    data: { dueDate?: Date; notes?: string; total?: number; billingIds?: string[] }
  ) {
    const charge = await Charge.findOne({ _id: chargeId, companyId });
    if (!charge) throw new Error("Cobrança não encontrada");
    if (charge.status === "paid" || charge.status === "cancelled") {
      throw new Error("Não é possível editar cobrança paga ou cancelada");
    }

    if (data.billingIds) {
      if (charge.paidAmount > 0) {
        throw new Error("Não é possível alterar fechamentos de cobrança com baixa já registrada");
      }

      const nextBillingIds = [...new Set(data.billingIds)].map((id) => new mongoose.Types.ObjectId(id));
      const billings = await Billing.find({ _id: { $in: nextBillingIds }, companyId });
      if (billings.length !== nextBillingIds.length) {
        throw new Error("Um ou mais fechamentos não foram encontrados");
      }

      const customerId = String(charge.customerId);
      for (const bill of billings) {
        if (String(bill.customerId) !== customerId) {
          throw new Error("Todos os fechamentos devem ser do mesmo cliente da cobrança");
        }
        const billChargeId = bill.chargeId ? String(bill.chargeId) : "";
        const outstanding = Number(bill.outstandingAmount ?? bill.calculation?.total ?? 0);
        if (bill.status === "paid" || bill.status === "cancelled" || outstanding <= 0.01) {
          throw new Error("Fechamento não está elegível para cobrança");
        }
        if ((billChargeId && billChargeId !== String(charge._id)) || bill.invoiceId) {
          throw new Error("Fechamento já pertence a outra cobrança/fatura e não pode ser reutilizado");
        }
      }

      const currentIds = new Set((charge.billingIds || []).map((id) => String(id)));
      const nextIds = new Set(nextBillingIds.map((id) => String(id)));
      const removedIds = [...currentIds].filter((id) => !nextIds.has(id));
      const addedIds = [...nextIds].filter((id) => !currentIds.has(id));

      if (removedIds.length > 0) {
        await Billing.updateMany(
          { _id: { $in: removedIds }, companyId, status: { $ne: "paid" } },
          { $set: { chargeId: null, financialStage: "pending", governance: "charge" } },
        );
      }

      for (const addedId of addedIds) {
        await financialService.attachBillingToCharge(addedId, charge._id);
      }

      charge.billingIds = nextBillingIds as any;
      if (typeof data.total !== "number") {
        const recalculatedTotal = billings.reduce(
          (acc, b) => acc + (b.outstandingAmount ?? b.calculation.total),
          0,
        );
        charge.total = recalculatedTotal;
      }
    }

    if (data.dueDate) charge.dueDate = data.dueDate;
    if (typeof data.notes === "string") charge.notes = data.notes;
    if (typeof data.total === "number" && data.total >= charge.paidAmount) {
      charge.total = data.total;
      charge.outstandingAmount = Math.max(0, data.total - charge.paidAmount);
      charge.status = charge.outstandingAmount === 0 ? "paid" : charge.paidAmount > 0 ? "partial" : "pending";
    } else if (data.billingIds) {
      charge.outstandingAmount = Math.max(0, charge.total - charge.paidAmount);
      charge.status = charge.outstandingAmount === 0 ? "paid" : charge.paidAmount > 0 ? "partial" : "pending";
    }
    await charge.save();
    return charge;
  }

  async generateChargePDF(companyId: string, chargeId: string): Promise<Buffer> {
    const charge = await Charge.findOne({ _id: chargeId, companyId })
      .populate("customerId")
      .populate({
        path: "billingIds",
        populate: [{ path: "items.itemId" }],
      });
    if (!charge) throw new Error("Cobrança não encontrada");

    const customer: any = charge.customerId;
    const billings: any[] = charge.billingIds as any[];

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 36, size: "A4" });
      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageW = 595 - 72;
      const left = 36;
      const right = left + pageW;
      const headerTop = 36;
      const logoPath = resolveInvoiceLogoPath();
      const colLeftW = 102;
      const colCenterX = left + colLeftW + 8;
      const colCenterW = 218;
      const colRightX = colCenterX + colCenterW + 12;
      const colRightW = Math.max(120, right - colRightX);

      let yAfterHeader = headerTop;
      let logoBottom = headerTop;
      if (fs.existsSync(logoPath)) {
        try {
          doc.image(logoPath, left, headerTop, { width: 95 });
          logoBottom = headerTop + 72;
        } catch {
          logoBottom = headerTop + 4;
        }
      }

      let cy = headerTop;
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#000000");
      doc.text(DOC_HEADER_BRAND_LINES[0], colCenterX, cy, {
        width: colCenterW,
        align: "center",
      });
      cy = doc.y + 3;
      doc.font("Helvetica").fontSize(7.5).fillColor("#333333");
      for (let i = 1; i < DOC_HEADER_BRAND_LINES.length; i++) {
        const line = DOC_HEADER_BRAND_LINES[i];
        doc.text(line, colCenterX, cy, { width: colCenterW, align: "center" });
        cy = doc.y + (line === "" ? 2 : 3);
      }
      doc.fillColor("#000000");
      const yCenterBottom = cy;

      let ry = headerTop;
      doc.font("Helvetica-Bold").fontSize(12).text("DEMONSTRATIVO DE VALORES", colRightX, ry, {
        width: colRightW,
        align: "right",
      });
      ry = doc.y + 6;
      doc.font("Helvetica").fontSize(9);
      doc.text(`Número da Cobrança: ${charge.chargeNumber}`, colRightX, ry, {
        width: colRightW,
        align: "right",
      });
      ry = doc.y + 5;
      doc.text(
        `Emissão: ${new Date(charge.createdAt || new Date()).toLocaleDateString("pt-BR")}`,
        colRightX,
        ry,
        { width: colRightW, align: "right" },
      );
      ry = doc.y + 5;
      doc.text(
        `Vencimento: ${charge.dueDate ? new Date(charge.dueDate).toLocaleDateString("pt-BR") : "-"}`,
        colRightX,
        ry,
        { width: colRightW, align: "right" },
      );
      const yRightBottom = doc.y + 4;

      yAfterHeader = Math.max(logoBottom, yCenterBottom, yRightBottom) + 10;
      let y = yAfterHeader;

      doc.moveTo(left, y).lineTo(right, y).stroke();
      y += 10;

      doc.font("Helvetica-Bold").fontSize(10).text("DESTINATÁRIO", left, y);
      y += 12;
      doc.font("Helvetica").fontSize(8.5);
      doc.text(`Nome: ${customer?.name || "-"}`, left, y);
      y += 11;
      if (customer?.cpfCnpj) {
        doc.text(`CNPJ / CPF: ${customer.cpfCnpj}`, left, y);
        y += 11;
      }
      if (customer?.phone) {
        doc.text(`Telefone: ${customer.phone}`, left, y);
        y += 11;
      }
      y += 10;

      doc.moveTo(left, y).lineTo(right, y).stroke();
      y += 8;

      const colDesc = left;
      const colPeriod = left + 200;
      const colType = left + 330;
      const colQ = left + 390;
      const colTot = left + 450;
      const descW = 190;

      doc.font("Helvetica-Bold").fontSize(8);
      doc.text("DESCRIÇÃO", colDesc, y);
      doc.text("PERÍODO", colPeriod, y);
      doc.text("TIPO", colType, y);
      doc.text("QTD", colQ, y);
      doc.text("V. TOTAL", colTot, y, { width: 70, align: "right" });
      y += 14;
      doc.font("Helvetica").fontSize(7.5);

      for (const bill of billings) {
        const period = `${new Date(bill.periodStart).toLocaleDateString("pt-BR")} a ${new Date(bill.periodEnd).toLocaleDateString("pt-BR")}`;
        for (const item of bill.items || []) {
          const itemName = item.itemId?.name || "Item";
          const rowH = Math.max(14, doc.heightOfString(itemName, { width: descW }) + 2);
          if (y + rowH > 760) {
            doc.addPage();
            y = 36;
          }
          doc.text(itemName, colDesc, y, { width: descW });
          doc.text(period, colPeriod, y, { width: 120 });
          const rentalTypeLabel = RENTAL_TYPE_PT_LABEL[String(bill.rentalType || "")] || String(bill.rentalType || "-");
          doc.text(rentalTypeLabel, colType, y, { width: 55 });
          doc.text(String(item.quantity || 1), colQ, y, { width: 35 });
          doc.text(`R$ ${Number(item.subtotal).toFixed(2)}`, colTot, y, { width: 70, align: "right" });
          y += rowH;
          if (y > 760) {
            doc.addPage();
            y = 36;
          }
        }

        for (const service of bill.services || []) {
          const serviceName = service.description || "Serviço";
          const rowH = Math.max(14, doc.heightOfString(serviceName, { width: descW }) + 2);
          if (y + rowH > 760) {
            doc.addPage();
            y = 36;
          }
          doc.text(serviceName, colDesc, y, { width: descW });
          doc.text(period, colPeriod, y, { width: 120 });
          doc.text("Serviço", colType, y, { width: 55 });
          doc.text(String(service.quantity || 1), colQ, y, { width: 35 });
          doc.text(`R$ ${Number(service.subtotal ?? 0).toFixed(2)}`, colTot, y, {
            width: 70,
            align: "right",
          });
          y += rowH;
          if (y > 760) {
            doc.addPage();
            y = 36;
          }
        }
      }

      y += 8;
      doc.moveTo(left, y).lineTo(right, y).stroke();
      y += 10;

      doc.font("Helvetica").fontSize(8.5);
      doc.text("Valor Total:", colDesc, y, { width: colTot - colDesc - 8, align: "right" });
      doc.text(`R$ ${charge.total.toFixed(2)}`, colTot, y, { width: 70, align: "right" });
      y += 12;
      doc.text("Saldo em Aberto:", colDesc, y, { width: colTot - colDesc - 8, align: "right" });
      doc.text(`R$ ${charge.outstandingAmount.toFixed(2)}`, colTot, y, { width: 70, align: "right" });

      y += 16;
      const sicoobPath = resolveSicoobLogoPath();
      if (fs.existsSync(sicoobPath)) {
        try {
          doc.image(sicoobPath, left, y, { width: 72 });
        } catch {}
      }
      doc.font("Helvetica-Bold").fontSize(8).text("Forma de Pagamento", left + 85, y);
      doc.font("Helvetica").fontSize(8);
      doc.text(DOC_FOOTER_PIX, left + 85, y + 12, { width: 210 });
      let by = y + 12;
      for (const line of DOC_FOOTER_BANK_LINES) {
        doc.text(line, right - 170, by, { width: 170 });
        by = doc.y + 2;
      }

      doc.end();
    });
  }
}

export const chargeService = new ChargeService();

