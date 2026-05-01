import mongoose from "mongoose";
import { Billing } from "../billings/billing.model";
import { FinancialPaymentEntry, FinancialStage } from "./financial.types";
import { Charge } from "../charges/charge.model";
import { Invoice } from "../invoices/invoice.model";

class FinancialService {
  async moveBillingStage(billingId: mongoose.Types.ObjectId | string, stage: FinancialStage) {
    await Billing.updateOne({ _id: billingId }, { $set: { financialStage: stage } });
  }

  async attachBillingToCharge(
    billingId: mongoose.Types.ObjectId | string,
    chargeId: mongoose.Types.ObjectId | string,
  ) {
    await Billing.updateOne(
      { _id: billingId },
      {
        $set: {
          chargeId,
          financialStage: "charge",
          governance: "charge",
        },
      },
    );
  }

  async attachBillingToInvoice(
    billingId: mongoose.Types.ObjectId | string,
    invoiceId: mongoose.Types.ObjectId | string,
  ) {
    await Billing.updateOne(
      { _id: billingId },
      {
        $set: {
          invoiceId,
          financialStage: "invoiced",
          governance: "invoice",
        },
      },
    );
  }

  async appendBillingPayment(billingId: mongoose.Types.ObjectId | string, entry: FinancialPaymentEntry) {
    const billing = await Billing.findById(billingId);
    if (!billing) {
      return;
    }

    const amount = Number(entry.amount || 0);
    const discount = Number(entry.discount || 0);
    const settlement = Number((amount + discount).toFixed(2));
    if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(discount) || discount < 0) {
      throw new Error("Valores de baixa inválidos");
    }
    if (settlement <= 0) {
      return;
    }

    const currentOutstanding = Number(billing.outstandingAmount ?? billing.calculation.total ?? 0);
    if (settlement - currentOutstanding > 0.01) {
      throw new Error("Valor de baixa + desconto não pode ser maior que o saldo em aberto");
    }

    const calculatedOutstanding = Math.max(0, Number((currentOutstanding - settlement).toFixed(2)));
    const nextOutstanding = calculatedOutstanding <= 0.01 ? 0 : calculatedOutstanding;
    const nextStage: FinancialStage = nextOutstanding === 0 ? "paid" : "charge";

    billing.outstandingAmount = nextOutstanding;
    billing.paymentHistory = [...(billing.paymentHistory || []), {
      ...entry,
      amount,
      discount,
    }];
    billing.financialStage = nextStage;
    if (nextOutstanding === 0) {
      billing.status = "paid";
      billing.paymentDate = entry.paidAt;
      if (entry.paymentMethod) billing.paymentMethod = entry.paymentMethod;
    }
    await billing.save();
  }

  async getUnifiedBoard(
    companyId: string,
    filters: { customerId?: string; status?: string; startDate?: Date; endDate?: Date },
  ) {
    const billingQuery: any = { companyId };
    if (filters.customerId) billingQuery.customerId = filters.customerId;
    if (filters.status) billingQuery.financialStage = filters.status;
    if (filters.startDate || filters.endDate) {
      billingQuery.billingDate = {};
      if (filters.startDate) billingQuery.billingDate.$gte = filters.startDate;
      if (filters.endDate) billingQuery.billingDate.$lte = filters.endDate;
    }

    const [billings, charges, invoices] = await Promise.all([
      Billing.find(billingQuery)
        .populate("customerId", "name")
        .populate("items.itemId", "name")
        .populate("rentalId", "workAddress rentalNumber")
        .sort({ billingDate: -1 }),
      Charge.find({ companyId })
        .populate("customerId", "name")
        .populate({
          path: "billingIds",
          populate: [
            { path: "items.itemId", select: "name" },
            { path: "rentalId", select: "workAddress rentalNumber" },
          ],
        })
        .sort({ createdAt: -1 }),
      Invoice.find({ companyId })
        .populate("customerId", "name")
        .populate({
          path: "billingIds",
          populate: [
            { path: "items.itemId", select: "name" },
            { path: "rentalId", select: "workAddress rentalNumber" },
          ],
        })
        .sort({ issueDate: -1 }),
    ]);

    return {
      billings,
      charges,
      invoices,
    };
  }

  async getDashboard(companyId: string) {
    const [billings, charges, invoices] = await Promise.all([
      Billing.find({ companyId }).populate("customerId").populate("items.itemId"),
      Charge.find({ companyId }).populate("customerId"),
      Invoice.find({ companyId }),
    ]);

    const byCustomer = new Map<string, { customerName: string; pending: number; overdue: number; paid: number }>();
    for (const bill of billings) {
      const customerKey = String((bill.customerId as any)?._id || bill.customerId);
      if (!byCustomer.has(customerKey)) {
        byCustomer.set(customerKey, {
          customerName: (bill.customerId as any)?.name || "Cliente",
          pending: 0,
          overdue: 0,
          paid: 0,
        });
      }
      const row = byCustomer.get(customerKey)!;
      const outstanding = bill.outstandingAmount ?? bill.calculation.total;
      if (bill.status === "paid") row.paid += bill.calculation.total;
      else row.pending += outstanding;
      if (bill.periodEnd < new Date() && bill.status !== "paid" && bill.status !== "cancelled") row.overdue += outstanding;
    }

    const revenueByItem = new Map<string, number>();
    for (const bill of billings) {
      if (bill.status !== "paid") continue;
      for (const it of bill.items || []) {
        const key = (it as any).itemId?.name || "Item";
        revenueByItem.set(key, (revenueByItem.get(key) || 0) + Number(it.subtotal || 0));
      }
    }

    const last12Months = Array.from({ length: 12 }).map((_, idx) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (11 - idx));
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return { month: key, paid: 0, invoiced: 0 };
    });
    for (const invoice of invoices) {
      const dt = new Date(invoice.issueDate);
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      const bucket = last12Months.find((m) => m.month === key);
      if (bucket) {
        bucket.invoiced += invoice.total;
        if (invoice.status === "paid") bucket.paid += invoice.total;
      }
    }

    return {
      byCustomer: [...byCustomer.values()],
      byItem: [...revenueByItem.entries()].map(([item, total]) => ({ item, total })),
      temporal: last12Months,
      totals: {
        pending: charges.reduce((acc, c) => acc + c.outstandingAmount, 0),
        paid: charges.reduce((acc, c) => acc + c.paidAmount, 0),
      },
    };
  }
}

export const financialService = new FinancialService();

