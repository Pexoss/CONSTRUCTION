import { Rental } from "./rental.model";
import { Item } from "../inventory/item.model";
import { ItemMovement } from "../inventory/itemMovement.model";
import {
  IRental,
  RentalStatus,
  IRentalItem,
  IRentalPricing,
  IRentalService,
  IRentalWorkAddress,
  IRentalChangeHistory,
  IRentalPendingApproval,
  RentalType,
  RentalDetails,
  UpdateRentalStatusResponse,
} from "./rental.types";
import mongoose, { Error } from "mongoose";
import { randomUUID } from "crypto";
import { ICustomer } from "../customers/customer.types";
import { Customer } from "../customers/customer.model";
import { RoleType } from "@/shared/constants/roles";
import {
  canApplyDiscount,
  canUpdateRentalStatus,
} from "../../helpers/UserPermission";
import { notificationService } from "../notification/notification.service";
import { User } from "../users/user.model";
import billingService, {
  calculateBillingPeriod,
  calculateRentalLineAmount,
  periodRateFromInventory,
} from "../billings/billing.service";
import {
  isValidCpfCnpj,
  normalizeDocument,
} from "../../shared/utils/document.utils";
import { Billing } from "../billings/billing.model";
import { Charge } from "../charges/charge.model";
import { Invoice } from "../invoices/invoice.model";
import { buildRentalLineKey } from "../../shared/utils/rental-line-key.util";
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
class RentalService {
  private getPeriodLengthDays(rentalType: RentalType): number {
    const periodDays: Record<RentalType, number> = {
      daily: 1,
      weekly: 7,
      biweekly: 15,
      monthly: 30,
    };

    return periodDays[rentalType];
  }

  private addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  private normalizeDate(date: Date): Date {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  }

  private normalizeCpf(value?: string | null): string {
    return normalizeDocument(value);
  }

  private isValidCpf(value?: string | null): boolean {
    return isValidCpfCnpj(value);
  }

  /** Linha ainda em aberto (sem devolução registrada); evita bater na linha histórica repetindo itemId/unitId. */
  private findOpenRentalItemIndex(
    items: IRentalItem[] | undefined,
    itemId: string,
    unitId?: string | null,
  ): number {
    const id = itemId.toString();
    const list = items || [];
    return list.findIndex((item) => {
      if (item.returnActual) return false;
      if (item.itemId.toString() !== id) return false;
      if (unitId != null && String(unitId).trim() !== "") {
        return item.unitId === unitId;
      }
      return !item.unitId;
    });
  }

  private findOpenRentalItem(
    items: IRentalItem[] | undefined,
    itemId: string,
    unitId?: string | null,
  ): IRentalItem | undefined {
    const idx = this.findOpenRentalItemIndex(items, itemId, unitId);
    if (idx === -1) return undefined;
    return (items || [])[idx];
  }

  private async removeObsoleteUnpaidItemBillings(
    companyId: string,
    rentalId: mongoose.Types.ObjectId,
    itemId: any,
    unitId?: string,
  ): Promise<void> {
    const filter: Record<string, unknown> = {
      companyId,
      rentalId,
      "items.itemId": itemId,
      status: { $ne: "paid" },
    };
    if (unitId) {
      filter["items.unitId"] = unitId;
    }

    const billings = await Billing.find(filter).select(
      "_id status calculation outstandingAmount paymentHistory chargeId invoiceId",
    );
    await this.deleteUnpaidBillingDocuments(companyId, billings);
  }

  private async deleteUnpaidBillingDocuments(
    companyId: string,
    billings: any[],
  ): Promise<void> {
    const removable = billings.filter((billing) => {
      const hasPayments = (billing.paymentHistory?.length ?? 0) > 0;
      const total = Number(billing.calculation?.total ?? 0);
      const outstanding = Number(billing.outstandingAmount ?? total);
      return !hasPayments && outstanding >= total - 0.01;
    });
    if (!removable.length) return;

    const candidateIds = removable.map((billing) => billing._id);
    const protectedIds = new Set<string>();

    const paidOrPartialCharges = await Charge.find({
      companyId,
      billingIds: { $in: candidateIds },
      $or: [
        { status: { $in: ["paid", "partial"] } },
        { paidAmount: { $gt: 0 } },
        { "payments.0": { $exists: true } },
      ],
    }).select("billingIds");
    for (const charge of paidOrPartialCharges) {
      for (const id of charge.billingIds || []) {
        if (candidateIds.some((candidateId) => String(candidateId) === String(id))) {
          protectedIds.add(String(id));
        }
      }
    }

    const paidInvoices = await Invoice.find({
      companyId,
      billingIds: { $in: candidateIds },
      status: "paid",
    }).select("billingIds");
    for (const invoice of paidInvoices) {
      for (const id of invoice.billingIds || []) {
        if (candidateIds.some((candidateId) => String(candidateId) === String(id))) {
          protectedIds.add(String(id));
        }
      }
    }

    const removableIds = candidateIds.filter((id) => !protectedIds.has(String(id)));
    if (!removableIds.length) return;

    const charges = await Charge.find({
      companyId,
      billingIds: { $in: removableIds },
      status: { $ne: "paid" },
    });
    for (const charge of charges) {
      if ((charge.payments?.length ?? 0) > 0 || Number(charge.paidAmount || 0) > 0) {
        continue;
      }
      const removedTotal = removable
        .filter((billing) =>
          (charge.billingIds || []).some((id: any) => String(id) === String(billing._id)),
        )
        .reduce(
          (acc, billing) =>
            acc + Number(billing.outstandingAmount ?? billing.calculation?.total ?? 0),
          0,
        );
      charge.billingIds = (charge.billingIds || []).filter(
        (id: any) => !removableIds.some((billingId) => String(billingId) === String(id)),
      );
      charge.total = Math.max(0, Number((charge.total - removedTotal).toFixed(2)));
      charge.outstandingAmount = Math.max(
        0,
        Number((charge.outstandingAmount - removedTotal).toFixed(2)),
      );
      if (charge.billingIds.length === 0) {
        await charge.deleteOne();
      } else {
        await charge.save();
      }
    }

    const invoices = await Invoice.find({
      companyId,
      billingIds: { $in: removableIds },
      status: { $ne: "paid" },
    });
    for (const invoice of invoices) {
      invoice.billingIds = (invoice.billingIds || []).filter(
        (id: any) => !removableIds.some((billingId) => String(billingId) === String(id)),
      );
      if (!invoice.billingIds.length) {
        await invoice.deleteOne();
      } else {
        await invoice.save();
      }
    }

    await Billing.deleteMany({
      _id: { $in: removableIds },
      companyId,
    });
  }

  /**
   * Remove fechamentos não pagos que cobrem apenas a mesma linha (item/unit) e sobrepõem a janela,
   * evitando fechamentos com quantidade/períodos obsoletos após devolução parcial.
   * Quando openSegmentRentalLineKey é informado (buildRentalLineKey do item em aberto),
   * apenas fechamentos com o mesmo campo rentalLineKey do item são removidos — preservando
   * fechamentos de segmentos já devolvidos (nova devolução parcial não deve apagar a anterior).
   * Fechamentos com vários equipamentos são ignorados.
   */
  private async deleteUnpaidBillingsOverlappingItemWindow(
    companyId: string,
    rentalId: mongoose.Types.ObjectId,
    itemId: any,
    unitId: string | undefined,
    windowStart: Date,
    windowEnd: Date,
    openSegmentRentalLineKey?: string,
  ): Promise<void> {
    const winStart = this.normalizeDate(windowStart);
    const winEnd = this.normalizeDate(windowEnd);
    const idStr = itemId?.toString?.() || String(itemId);

    const billings = await Billing.find({
      companyId,
      rentalId,
      status: { $nin: ["paid", "cancelled"] },
      "items.0": { $exists: true },
    }).select(
      "_id status calculation outstandingAmount paymentHistory chargeId invoiceId periodStart periodEnd items",
    );

    const overlappingSameLineOnly = billings.filter((billing) => {
      const bs = this.normalizeDate(new Date(billing.periodStart));
      const be = this.normalizeDate(new Date(billing.periodEnd));
      if (bs.getTime() > winEnd.getTime() || be.getTime() < winStart.getTime()) {
        return false;
      }

      const itemsArr = billing.items || [];
      if (itemsArr.length === 0) return false;

      return itemsArr.every((bi: any) => {
        const bid = bi.itemId?.toString?.() || String(bi.itemId);
        if (bid !== idStr) return false;
        if (unitId != null && String(unitId).trim() !== "") {
          if (bi.unitId !== unitId) return false;
        } else if (bi.unitId) {
          return false;
        }
        const scopedKey =
          typeof openSegmentRentalLineKey === "string" &&
          openSegmentRentalLineKey.trim().length > 0
            ? openSegmentRentalLineKey.trim()
            : undefined;
        if (scopedKey) {
          const rowKey =
            typeof bi?.rentalLineKey === "string" && bi.rentalLineKey.trim().length > 0
              ? bi.rentalLineKey.trim()
              : "";
          if (!rowKey) {
            return false;
          }
          if (rowKey !== scopedKey) {
            return false;
          }
        }
        return true;
      });
    });

    if (overlappingSameLineOnly.length) {
      await this.deleteUnpaidBillingDocuments(companyId, overlappingSameLineOnly);
    }
  }

  private async removeObsoleteUnpaidBillingsForCurrentRental(
    companyId: string,
    rental: IRental,
  ): Promise<void> {
    const validLineKeys = new Map<string, RentalType>();
    const validFallbackKeys = new Set<string>();
    const returnedLineCutoffs = new Map<string, Date>();
    const returnedFallbackCutoffs = new Map<string, Date>();

    for (const item of rental.items || []) {
      const rentalType = item.rentalType || "daily";
      const lineKey = buildRentalLineKey(item as any);
      validLineKeys.set(lineKey, rentalType);
      const itemId = item.itemId?.toString?.() || String(item.itemId);
      const unitId = item.unitId ? String(item.unitId) : "no-unit";
      const fallbackKey = `${itemId}|${unitId}|${rentalType}`;
      validFallbackKeys.add(fallbackKey);

      if (item.returnActual) {
        const cutoff = this.normalizeDate(item.returnActual);
        returnedLineCutoffs.set(lineKey, cutoff);
        returnedFallbackCutoffs.set(fallbackKey, cutoff);
      }
    }

    const billings = await Billing.find({
      companyId,
      rentalId: rental._id,
      status: { $ne: "paid" },
      "items.0": { $exists: true },
    }).select(
      "_id rentalType periodStart items calculation outstandingAmount paymentHistory chargeId invoiceId",
    );

    const obsolete = billings.filter((billing) => {
      const items = billing.items || [];
      if (!items.length) return false;

      const hasCurrentRentalLine = items.some((billingItem: any) => {
        const lineKey = billingItem.rentalLineKey
          ? String(billingItem.rentalLineKey)
          : "";
        if (lineKey) {
          const currentType = validLineKeys.get(lineKey);
          return currentType === billing.rentalType;
        }

        const itemId =
          billingItem.itemId?.toString?.() || String(billingItem.itemId);
        const unitId = billingItem.unitId ? String(billingItem.unitId) : "no-unit";
        const fallbackKey = `${itemId}|${unitId}|${billing.rentalType || "daily"}`;
        return validFallbackKeys.has(fallbackKey);
      });

      if (!hasCurrentRentalLine) return true;

      const periodStart = this.normalizeDate(billing.periodStart);
      return items.every((billingItem: any) => {
        const lineKey = billingItem.rentalLineKey
          ? String(billingItem.rentalLineKey)
          : "";
        if (lineKey) {
          const cutoff = returnedLineCutoffs.get(lineKey);
          return cutoff ? periodStart.getTime() >= cutoff.getTime() : false;
        }

        const itemId =
          billingItem.itemId?.toString?.() || String(billingItem.itemId);
        const unitId = billingItem.unitId ? String(billingItem.unitId) : "no-unit";
        const fallbackKey = `${itemId}|${unitId}|${billing.rentalType || "daily"}`;
        const cutoff = returnedFallbackCutoffs.get(fallbackKey);
        return cutoff ? periodStart.getTime() >= cutoff.getTime() : false;
      });
    });

    await this.deleteUnpaidBillingDocuments(companyId, obsolete);
  }

  private async getLatestLockedItemBillingEnd(
    companyId: string,
    rentalId: mongoose.Types.ObjectId,
    itemId: any,
    unitId?: string,
  ): Promise<Date | undefined> {
    const filter: Record<string, unknown> = {
      companyId,
      rentalId,
      "items.itemId": itemId,
      $or: [
        { status: "paid" },
        { "paymentHistory.0": { $exists: true } },
      ],
    };
    if (unitId) {
      filter["items.unitId"] = unitId;
    }

    const billing = await Billing.findOne(filter)
      .sort({ periodEnd: -1 })
      .select("periodEnd")
      .lean();
    return billing?.periodEnd ? this.normalizeDate(billing.periodEnd) : undefined;
  }

  private getPricingEndDate(startDate: Date, rentalType: RentalType): Date {
    const normalizedStart = this.normalizeDate(startDate);
    switch (rentalType) {
      case "daily":
        return this.addDays(normalizedStart, 1);
      case "weekly":
      case "biweekly":
      case "monthly":
        return this.getPeriodEnd(normalizedStart, rentalType);
      default:
        return this.addDays(normalizedStart, 1);
    }
  }

  /** Até quando pode haver fechamento automático “aprovado” (não ultrapassa hoje nem a devolução real). */
  private getBillingHorizonForItem(item: IRentalItem, today: Date): Date {
    const t = this.normalizeDate(today);
    if (item.returnActual) {
      const a = this.normalizeDate(item.returnActual);
      return a.getTime() <= t.getTime() ? a : t;
    }
    if (
      item.retroactiveOpenBilling &&
      item.returnScheduled &&
      this.normalizeDate(item.returnScheduled) < t
    ) {
      return t;
    }
    if (!item.returnScheduled) {
      return t;
    }
    const s = this.normalizeDate(item.returnScheduled);
    if (s.getTime() > t.getTime()) {
      return t;
    }
    return s;
  }

  /** Limite superior para rascunho de próximo período (null = sem data de devolução prevista). */
  private getContractualReturnForDraft(item: IRentalItem): Date | null {
    if (item.returnActual) {
      return this.normalizeDate(item.returnActual);
    }
    if (item.retroactiveOpenBilling) {
      return null;
    }
    if (item.returnScheduled) {
      return this.normalizeDate(item.returnScheduled);
    }
    return null;
  }

  /**
   * Devolução prevista no passado: ou marca entrega histórica (returnActual) ou cobrança em aberto até hoje.
   */
  private finalizeRetroactiveFlagsForItem(
    item: IRentalItem,
    historicalDelivery: boolean | undefined,
    today: Date,
  ) {
    const t = this.normalizeDate(today);
    const ret = item.returnScheduled
      ? this.normalizeDate(item.returnScheduled)
      : null;

    if (!ret || ret.getTime() >= t.getTime()) {
      item.retroactiveOpenBilling = false;
      return;
    }

    if (item.returnActual) {
      item.retroactiveOpenBilling = false;
      return;
    }

    if (historicalDelivery === true) {
      item.returnActual = ret;
      item.retroactiveOpenBilling = false;
      return;
    }

    if (historicalDelivery === false) {
      item.retroactiveOpenBilling = true;
      return;
    }

    item.retroactiveOpenBilling = true;
  }

  private getPeriodEnd(startDate: Date, rentalType: RentalType): Date {
    const normalizedStart = this.normalizeDate(startDate);
    return this.addDays(
      normalizedStart,
      this.getPeriodLengthDays(rentalType) - 1,
    );
  }

  private addPeriod(date: Date, rentalType: RentalType): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + this.getPeriodLengthDays(rentalType));
    return next;
  }

  private rentalTypeLabelForError(rentalType: RentalType): string {
    const labels: Record<RentalType, string> = {
      daily: "diário",
      weekly: "semanal",
      biweekly: "quinzenal",
      monthly: "mensal",
    };
    return labels[rentalType];
  }

  private getConfiguredRateForRentalType(
    inventoryItem: any,
    rentalType: RentalType,
  ): number {
    const rates: Record<RentalType, number> = {
      daily: Number(inventoryItem.pricing?.dailyRate ?? 0),
      weekly: Number(inventoryItem.pricing?.weeklyRate ?? 0),
      biweekly: Number(inventoryItem.pricing?.biweeklyRate ?? 0),
      monthly: Number(inventoryItem.pricing?.monthlyRate ?? 0),
    };
    return Math.max(0, rates[rentalType] || 0);
  }

  private assertConfiguredRateForRentalType(
    inventoryItem: any,
    rentalType: RentalType,
  ): void {
    const rate = this.getConfiguredRateForRentalType(inventoryItem, rentalType);
    if (rate <= 0) {
      throw new Error(
        `Cadastre o valor ${this.rentalTypeLabelForError(rentalType)} do item "${inventoryItem.name}" antes de concluir o aluguel.`,
      );
    }
  }
  /**
   * Calculate rental price based on period and rates
   * NOVO: Suporta biweeklyRate e rentalType
   */
  private calculateRentalPrice(
    dailyRate: number,
    weeklyRate: number | undefined,
    biweeklyRate: number | undefined,
    monthlyRate: number | undefined,
    startDate: Date,
    endDate: Date,
    rentalType?: RentalType,
  ): number {
    if (!rentalType) {
      throw new Error("RentalType é obrigatório para cálculo do aluguel");
    }

    const period = calculateBillingPeriod(startDate, endDate, rentalType);
    return calculateRentalLineAmount(
      { dailyRate, weeklyRate, biweeklyRate, monthlyRate },
      rentalType,
      period,
    ).amount;
  }
  /**
   * Calculate late fee
   */
  private calculateLateFee(
    returnScheduled: Date,
    returnActual: Date,
    dailyRate: number,
    quantity: number,
  ): number {
    if (returnActual <= returnScheduled) {
      return 0;
    }

    const daysLate = Math.ceil(
      (returnActual.getTime() - returnScheduled.getTime()) /
        (1000 * 60 * 60 * 24),
    );
    // Late fee is typically 1.5x the daily rate per day
    return daysLate * dailyRate * 1.5 * quantity;
  }

  /**
   *
   * Create retalNumber
   */
  async generateRentalNumber(companyId: string): Promise<string> {
    const RentalModel = mongoose.model<IRental>("Rental");
    const count = await RentalModel.countDocuments({ companyId });
    const rentalNumber = `ALGUEL-${companyId.toString().slice(-6)}-${String(count + 1).padStart(6, "0")}`; //pega os 6 ulimos dígitos do id da empresa - contador
    return rentalNumber;
  }

  //createRental revisado
  async createRental(
    companyId: string,
    data: any,
    userId: string,
  ): Promise<IRental> {
    const rentalNumber = await this.generateRentalNumber(companyId);
    const user = await User.findById(userId);
    if (!user) throw new Error("Usuário não encontrado");

    if (data.pricing?.discount && !canApplyDiscount(user.role as RoleType)) {
      throw new Error("Somente o admin pode aplicar desconto");
    }

    const customer = await Customer.findOne({ _id: data.customerId, companyId });
    if (!customer) throw new Error("Cliente não encontrado");

    const customerCpf = this.normalizeCpf(data.customerCpf || customer.cpfCnpj);
    if (!this.isValidCpf(customerCpf)) {
      throw new Error("Informe um CPF/CNPJ válido para o cliente");
    }

    const duplicateCpfCustomer = await Customer.findOne({
      _id: { $ne: customer._id },
      companyId,
      cpfCnpj: customerCpf,
    });
    if (duplicateCpfCustomer) {
      throw new Error("CPF/CNPJ já cadastrado para outro cliente");
    }

    if (this.normalizeCpf(customer.cpfCnpj) !== customerCpf) {
      customer.cpfCnpj = customerCpf;
      customer.validated = {
        ...(customer.validated || {}),
        isValidated: false,
      };
      await customer.save();
    }

    //Função para pegar tipo pelo item
    const getRentalTypeFromItem = (item: any): RentalType => {
      if (item.pricing?.monthlyRate) return "monthly";
      if (item.pricing?.biweeklyRate) return "biweekly";
      if (item.pricing?.weeklyRate) return "weekly";
      return "daily";
    };

    const calculateRentalPriceCorrect = (
      dailyRate = 0,
      weeklyRate = 0,
      biweeklyRate = 0,
      monthlyRate = 0,
      startDate: Date,
      endDate: Date,
      rentalType: RentalType,
    ) => {
      const period = calculateBillingPeriod(startDate, endDate, rentalType);
      return calculateRentalLineAmount(
        { dailyRate, weeklyRate, biweeklyRate, monthlyRate },
        rentalType,
        period,
      ).amount;
    };

    // Validar disponibilidade e preço do tipo escolhido
    for (const item of data.items) {
      const inventoryItem = await Item.findOne({ _id: item.itemId, companyId });
      if (!inventoryItem) throw new Error(`Item ${item.itemId} não encontrado`);

      const rentalType: RentalType =
        item.rentalType &&
        ["daily", "weekly", "biweekly", "monthly"].includes(item.rentalType)
          ? item.rentalType
          : getRentalTypeFromItem(inventoryItem);
      this.assertConfiguredRateForRentalType(inventoryItem, rentalType);

      if (inventoryItem.trackingType === "unit") {
        if (!item.unitId)
          throw new Error(`Item ${inventoryItem.name} precisa de unitId`);

        const unit = inventoryItem.units?.find((u) => u.unitId === item.unitId);
        if (!unit || unit.status !== "available") {
          const availableUnits =
            inventoryItem.units
              ?.filter((u) => u.status === "available")
              .map((u) => u.unitId)
              .join(", ") || "nenhuma";
          const currentStatus = unit?.status || "não encontrada";
          throw new Error(
            `Unidade ${item.unitId} do item "${inventoryItem.name}" indisponível (status: ${currentStatus}). Unidades disponíveis: ${availableUnits}.`,
          );
        }
      } else {
        const available = inventoryItem.quantity.available || 0;
        if (available < item.quantity) {
          throw new Error(
            `Estoque insuficiente para "${inventoryItem.name}". Disponível: ${available}. Solicitado: ${item.quantity}.`,
          );
        }
      }
    }

    // 💰 Cálculo de preços
    const itemsWithPricing: IRentalItem[] = [];
    let equipmentSubtotal = 0;

    const pickupDates: Date[] = [];
    const returnDates: Date[] = [];

    const today = this.normalizeDate(new Date());

    for (const item of data.items) {
      const inventoryItem = await Item.findOne({ _id: item.itemId, companyId });
      if (!inventoryItem) continue;

      const rentalType: RentalType =
        item.rentalType && ["daily", "weekly", "biweekly", "monthly"].includes(item.rentalType)
          ? item.rentalType
          : getRentalTypeFromItem(inventoryItem);
      const pickupScheduled = new Date(item.pickupScheduled);
      const returnScheduled = item.returnScheduled
        ? new Date(item.returnScheduled)
        : this.getPricingEndDate(pickupScheduled, rentalType);

      const retNorm = this.normalizeDate(returnScheduled);
      let returnActual: Date | undefined;
      let retroactiveOpenBilling = false;

      if (retNorm.getTime() < today.getTime()) {
        if (item.historicalDelivery === true) {
          returnActual = retNorm;
        } else {
          retroactiveOpenBilling = true;
        }
      }

      pickupDates.push(pickupScheduled);
      returnDates.push(returnScheduled);

      const unitPrice = calculateRentalPriceCorrect(
        inventoryItem.pricing.dailyRate,
        inventoryItem.pricing.weeklyRate,
        inventoryItem.pricing.biweeklyRate,
        inventoryItem.pricing.monthlyRate,
        pickupScheduled,
        returnScheduled,
        rentalType,
      );

      const subtotal = unitPrice * item.quantity;

      itemsWithPricing.push({
        itemId: item.itemId,
        unitId: item.unitId,
        quantity: item.quantity,
        unitPrice,
        rentalType,
        pickupScheduled,
        returnScheduled,
        returnActual,
        retroactiveOpenBilling,
        subtotal,
      });

      equipmentSubtotal += subtotal;
    }

    // Serviços
    let servicesSubtotal = 0;
    const services: IRentalService[] = (data.services || []).map(
      (service: any) => {
        const quantity = service.quantity || 1;
        const subtotal = service.price * quantity;
        servicesSubtotal += subtotal;
        return {
          description: service.description,
          price: service.price,
          quantity,
          subtotal,
          category: service.category || "other",
          notes: service.notes,
        };
      },
    );

    const totalSubtotal = equipmentSubtotal + servicesSubtotal;
    const discount = data.pricing?.discount || 0;

    const minPickupDate = new Date(
      Math.min(...pickupDates.map((d) => d.getTime())),
    );
    const maxReturnDate = new Date(
      Math.max(...returnDates.map((d) => d.getTime())),
    );

    const diffTime = maxReturnDate.getTime() - minPickupDate.getTime();
    const contractedDays = Math.max(
      1,
      Math.ceil(diffTime / (1000 * 60 * 60 * 24)),
    );

    const pricing: IRentalPricing = {
      equipmentSubtotal,
      originalEquipmentSubtotal: equipmentSubtotal,
      contractedDays,
      usedDays: 0,
      servicesSubtotal,
      subtotal: totalSubtotal,
      discount,
      discountReason: data.pricing?.discountReason,
      discountApprovedBy: data.pricing?.discountApprovedBy
        ? new mongoose.Types.ObjectId(data.pricing.discountApprovedBy)
        : undefined,
      lateFee: 0,
      total: totalSubtotal - discount,
    };

    //Criar rental
    const rental = await Rental.create({
      companyId,
      customerId: data.customerId,
      rentalNumber,
      items: itemsWithPricing,
      services: services.length > 0 ? services : undefined,
      workAddress: data.workAddress
        ? {
            street: data.workAddress.street,
            number: data.workAddress.number,
            complement: data.workAddress.complement,
            neighborhood: data.workAddress.neighborhood,
            city: data.workAddress.city,
            state: data.workAddress.state,
            zipCode: data.workAddress.zipCode,
            workName: data.workAddress.workName,
            workId:
              data.workAddress.workId &&
              mongoose.Types.ObjectId.isValid(data.workAddress.workId)
                ? new mongoose.Types.ObjectId(data.workAddress.workId)
                : undefined,
          }
        : undefined,
      fulfillmentMethod: data.fulfillmentMethod,
      dates: {
        reservedAt: new Date(),
        pickupScheduled: minPickupDate,
        returnScheduled: maxReturnDate,
      },
      pricing,
      status: "active",
      notes: data.notes,
      createdBy: userId,
    });

    // Estoque: reserva e em seguida ativa (aluguel já ativo na criação)
    for (const item of data.items) {
      await this.updateItemQuantityForRental(
        companyId,
        item.itemId,
        item.quantity,
        "reserve",
        userId,
        rental._id,
        item.unitId,
        data.customerId,
      );
    }
    for (const item of data.items) {
      await this.updateItemQuantityForRental(
        companyId,
        item.itemId,
        item.quantity,
        "activate",
        userId,
        rental._id,
        item.unitId,
        data.customerId,
      );
    }

    await this.syncBillingsAfterRentalChange(
      companyId,
      String(rental._id),
      userId,
    );

    const withBillings = await Rental.findOne({ _id: rental._id, companyId });
    return withBillings || rental;
  }
  async closeRental(companyId: string, rentalId: string, userId: string) {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw new Error("Aluguel não encontrado");
    }

    if (rental.status === "completed") {
      throw new Error("Aluguel já finalizado");
    }

    //Datas reais
    const pickupDate =
      rental.dates.pickupActual || rental.dates.pickupScheduled;
    const returnDate = new Date();

    rental.dates.returnActual = returnDate;

    //Dias utilizados
    const diffTime = returnDate.getTime() - pickupDate.getTime();

    const usedDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    let equipmentSubtotal = 0;

    //Calcular por item
    for (const item of rental.items) {
      const inventoryItem = await Item.findById(item.itemId);

      if (!inventoryItem) continue;

      const rentalType = item.rentalType || "daily";

      const period = calculateBillingPeriod(pickupDate, returnDate, rentalType);
      const unitPrice = calculateRentalLineAmount(
        inventoryItem.pricing,
        rentalType,
        period,
      ).amount;

      const subtotal = unitPrice * item.quantity;

      //Atualiza item
      item.unitPrice = unitPrice;
      item.subtotal = subtotal;

      equipmentSubtotal += subtotal;
    }

    //Serviços
    const servicesSubtotal =
      rental.services?.reduce((acc, s) => acc + s.subtotal, 0) || 0;

    const discount = rental.pricing.discount || 0;
    const lateFee = 0;

    //Total final
    const total = equipmentSubtotal + servicesSubtotal - discount + lateFee;

    //Atualiza pricing
    rental.pricing.equipmentSubtotal = equipmentSubtotal;
    rental.pricing.originalEquipmentSubtotal = equipmentSubtotal;
    rental.pricing.servicesSubtotal = servicesSubtotal;
    rental.pricing.subtotal = equipmentSubtotal + servicesSubtotal;
    rental.pricing.total = total;
    rental.pricing.usedDays = usedDays;
    rental.pricing.lateFee = lateFee;

    //Status
    await this.applyStatusChangeDirect(
      rental,
      rental.status,
      "completed",
      companyId,
      userId,
    );

    await rental.save();
    return rental;
  }

  async getClosePreview(rentalId: string, companyId: string) {
    const rental = await Rental.findOne({
      _id: rentalId,
      companyId,
    }).lean();

    if (!rental) {
      throw new Error("Aluguel não encontrado");
    }

    const startDate = rental.dates.pickupActual ?? rental.dates.pickupScheduled;
    const endDate = rental.dates.returnActual ?? new Date();
    const diffInMs = endDate.getTime() - startDate.getTime();
    const usedDays = Math.max(1, Math.ceil(diffInMs / (1000 * 60 * 60 * 24)));

    // Dias contratados e tipo de contrato
    let contractedDays = rental.pricing.contractedDays;
    if (!contractedDays) {
      // fallback: calcula diferença entre datas agendadas
      const scheduledStart = rental.dates.pickupScheduled;
      const scheduledEnd = rental.dates.returnScheduled;
      const diff =
        new Date(scheduledEnd).getTime() - new Date(scheduledStart).getTime();
      contractedDays = Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }
    // Tipo de contrato: pega do primeiro item ou do ciclo de faturamento
    const rentalType =
      rental.dates.billingCycle || rental.items[0]?.rentalType || "daily";

    const originalTotal = rental.pricing.total;

    // Calcular valor proporcional de cada item
    let recalculatedEquipment = 0;
    for (const item of rental.items) {
      const inventoryItem = await Item.findOne({ _id: item.itemId, companyId }).lean();
      if (!inventoryItem) continue;
      const itemRentalType = item.rentalType || "daily";
      const period = calculateBillingPeriod(startDate, endDate, itemRentalType);
      const { amount } = calculateRentalLineAmount(
        inventoryItem.pricing,
        itemRentalType,
        period,
      );
      recalculatedEquipment += amount * item.quantity;
    }

    const recalculatedTotal =
      recalculatedEquipment +
      (rental.pricing.servicesSubtotal || 0) -
      (rental.pricing.discount || 0) +
      (rental.pricing.lateFee || 0);

    return {
      originalTotal,
      recalculatedTotal,
      usedDays,
      contractedDays,
      rentalType,
    };
  }

  async getClosePreviewItem(
    rentalId: string,
    itemId: string,
    companyId: string,
    unitId?: string,
  ) {
    const rental = await Rental.findOne({
      _id: rentalId,
      companyId,
    }).lean();

    if (!rental) {
      throw new Error("Aluguel não encontrado");
    }

    const targetItem = this.findOpenRentalItem(rental.items, itemId, unitId);

    if (!targetItem) {
      throw new Error("Item não encontrado no aluguel");
    }

    const startDate =
      targetItem.pickupScheduled || rental.dates.pickupScheduled;
    const endDate = targetItem.returnActual || new Date();
    const diffInMs = endDate.getTime() - startDate.getTime();
    const usedDays = Math.max(1, Math.ceil(diffInMs / (1000 * 60 * 60 * 24)));

    let contractedDays = 1;
    if (targetItem.returnScheduled) {
      const diff =
        new Date(targetItem.returnScheduled).getTime() -
        new Date(startDate).getTime();
      contractedDays = Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }

    const rentalType = targetItem.rentalType || "daily";
    const originalTotal = targetItem.subtotal || 0;

    const inventoryItem = await Item.findOne({ _id: targetItem.itemId, companyId }).lean();
    if (!inventoryItem) {
      throw new Error("Item do inventário não encontrado");
    }
    const period = calculateBillingPeriod(startDate, endDate, rentalType);
    const { amount } = calculateRentalLineAmount(
      inventoryItem.pricing,
      rentalType,
      period,
    );

    const recalculatedTotal = amount * targetItem.quantity;

    // Calcula o total do aluguel APÓS fechar este item
    let rentalTotalAfterClose = 0;
    for (const item of rental.items) {
      if (item.itemId.toString() === itemId && (!unitId || item.unitId === unitId)) {
        // Este é o item que está sendo fechado - usa o valor recalculado
        rentalTotalAfterClose += recalculatedTotal;
      } else {
        // Outros itens - usa o valor atual (pode estar já fechado ou não)
        rentalTotalAfterClose += item.subtotal || 0;
      }
    }

    const servicesSubtotal =
      rental.services?.reduce((acc, s) => acc + s.subtotal, 0) || 0;
    rentalTotalAfterClose +=
      servicesSubtotal -
      (rental.pricing.discount || 0) +
      (rental.pricing.lateFee || 0);
    rentalTotalAfterClose = Math.max(0, rentalTotalAfterClose);

    return {
      originalTotal,
      recalculatedTotal,
      usedDays,
      contractedDays,
      rentalType,
      rentalTotalAfterClose,
    };
  }

  async closeRentalItem(
    companyId: string,
    rentalId: string,
    itemId: string,
    userId: string,
    returnDate?: Date,
    unitId?: string,
  ): Promise<IRental> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw new Error("Aluguel não encontrado");
    }

    const targetItem = this.findOpenRentalItem(rental.items, itemId, unitId);

    if (!targetItem) {
      throw new Error("Item não encontrado no aluguel");
    }

    if (targetItem.returnActual) {
      throw new Error("Item já finalizado");
    }

    // =========================
    // 1. VALIDAR E BUSCAR ITEM DO INVENTÁRIO
    // =========================
    const inventoryItem = await Item.findOne({
      _id: targetItem.itemId,
      companyId,
    });

    if (!inventoryItem) {
      throw new Error(
        `Sistema de aluguel: Item com ID ${targetItem.itemId} não foi encontrado no inventário. O item pode ter sido removido do sistema. Por favor, contate o administrador para verificar a consistência dos dados.`
      );
    }

    // =========================
    // 2. FINALIZA ITEM
    // =========================
    const finalReturnDate = returnDate || new Date();
    targetItem.returnActual = finalReturnDate;
    targetItem.retroactiveOpenBilling = false;
    targetItem.nextBillingDate = undefined;
    await this.removeObsoleteUnpaidBillingsForCurrentRental(companyId, rental);

    // Validar antes de fazer a devolução
    if (inventoryItem.trackingType !== "unit") {
      // Para itens quantitativos, validar a quantidade
      if (inventoryItem.quantity.rented < targetItem.quantity) {
        console.error("[ERRO] Inconsistência de quantidade detectada:", {
          itemName: inventoryItem.name,
          itemId: targetItem.itemId,
          esperadoDevolucao: targetItem.quantity,
          alugadaAtualmente: inventoryItem.quantity.rented,
          disponivel: inventoryItem.quantity.available,
          reservada: inventoryItem.quantity.reserved,
          rentalId,
          customerId: rental.customerId,
          rentalStatus: rental.status,
        });

        // Verificar se está em "reserved" ao invés de "rented"
        if (inventoryItem.quantity.reserved >= targetItem.quantity) {
          throw new Error(
            `Item "${inventoryItem.name}" não foi ativado: O item ainda está reservado e não foi confirmado como retirado. Por favor, cancele a reserva ou ative o aluguel antes de fechar o item. Contate o administrador se este erro persistir.`
          );
        }

        throw new Error(
          `Quantidade inconsistente para "${inventoryItem.name}": O sistema registra apenas ${inventoryItem.quantity.rented} unidades alugadas, mas o contrato indica ${targetItem.quantity}. Isto pode indicar uma inconsistência nos dados ou que o item já foi devolvido anteriormente. Por favor, contate o administrador.`
        );
      }
    }

    await this.updateItemQuantityForRental(
      companyId,
      targetItem.itemId as any,
      targetItem.quantity,
      "return",
      userId,
      rental._id,
      targetItem.unitId,
      rental.customerId.toString(),
    );

    // =========================
    // 2. BILLING FINAL DO ITEM
    // =========================
    const periodStart = targetItem.lastBillingDate
      ? this.addDays(targetItem.lastBillingDate, 1)
      : targetItem.pickupScheduled || rental.dates.pickupScheduled;

    const periodEnd = finalReturnDate;
    let finalBillingSubtotal: number | undefined;

    if (periodEnd > periodStart) {
      const normalizedPeriodStart = new Date(periodStart);
      normalizedPeriodStart.setHours(0, 0, 0, 0);
      const normalizedPeriodEnd = new Date(periodEnd);
      normalizedPeriodEnd.setHours(0, 0, 0, 0);
      const rentalLineKey = buildRentalLineKey(targetItem as any);
      let finalBilling: any = await Billing.findOne({
        companyId,
        rentalId: rental._id,
        "items.itemId": targetItem.itemId,
        ...(targetItem.unitId ? { "items.unitId": targetItem.unitId } : {}),
        "items.rentalLineKey": rentalLineKey,
        periodStart: normalizedPeriodStart,
        periodEnd: normalizedPeriodEnd,
      });

      if (!finalBilling) {
        finalBilling = await billingService.createPeriodicBillingForItem(
          companyId,
          rental,
          targetItem,
          periodStart,
          periodEnd,
          userId,
          {
            includeServices: false,
            notes: "Fechamento final do item",
            status: "approved",
          },
        );
      }

      const billingItem = finalBilling.items?.find((item: any) => {
        const sameItem = String(item.itemId) === String(targetItem.itemId);
        const sameUnit = targetItem.unitId ? item.unitId === targetItem.unitId : true;
        return sameItem && sameUnit;
      });
      finalBillingSubtotal = Number(billingItem?.subtotal || finalBilling.calculation?.baseAmount || 0);
      targetItem.lastBillingDate = periodEnd;
      targetItem.nextBillingDate = undefined;
    }

    // =========================
    // 3. RECALCULAR ITEM - USANDO PERÍODO DESDE ÚLTIMA COBRANÇA
    // =========================
    const diffTime = finalReturnDate.getTime() - new Date(periodStart).getTime();

    // Cálculo proporcional de dias (não arredonda para cima)
    const usedDaysExact = diffTime / (1000 * 60 * 60 * 24);
    const usedDays = Math.max(1, usedDaysExact);

    targetItem.subtotal =
      finalBillingSubtotal ??
      this.computeItemPartialSubtotal(
        targetItem,
        periodStart,
        periodEnd,
        targetItem.quantity,
      );
    targetItem.usedDays = Math.ceil(usedDays);

    // =========================
    // 4. RECALCULAR TOTAL DO ALUGUEL
    // =========================
    let equipmentSubtotal = 0;

    for (const item of rental.items) {
      equipmentSubtotal += item.subtotal || 0;
    }

    const servicesSubtotal =
      rental.services?.reduce((acc, s) => acc + s.subtotal, 0) || 0;

    const total =
      equipmentSubtotal +
      servicesSubtotal +
      -(rental.pricing.discount || 0) +
      (rental.pricing.lateFee || 0);

    rental.pricing.equipmentSubtotal = equipmentSubtotal;
    rental.pricing.subtotal = equipmentSubtotal + servicesSubtotal;
    rental.pricing.total = Math.max(0, total);

    // =========================
    // 5. VERIFICA SE TODOS FORAM DEVOLVIDOS
    // =========================
    const allReturned = rental.items.every((item) => item.returnActual);

    if (allReturned) {
      // pega a maior data de devolução
      const maxReturn = rental.items.reduce<Date | null>((acc, item) => {
        if (!item.returnActual) return acc;
        if (!acc) return item.returnActual;
        return item.returnActual > acc ? item.returnActual : acc;
      }, null);

      if (maxReturn) {
        rental.dates.returnActual = maxReturn;
      }

      // Status muda para ready_to_close quando todos os itens foram devolvidos
      // Aguardando confirmação do usuário para finalizar completamente
      if (rental.status !== "ready_to_close") {
        rental.status = "ready_to_close";
      }
    }

    // =========================
    // 6. SALVA
    // =========================
    await rental.save();

    return rental;
  }

  private computeItemPartialSubtotal(
    item: IRentalItem,
    periodStart: Date,
    periodEnd: Date,
    quantity: number,
  ): number {
    const diffTime = new Date(periodEnd).getTime() - new Date(periodStart).getTime();
    const usedDays = Math.max(1, diffTime / (1000 * 60 * 60 * 24));
    const rentalType = item.rentalType || "daily";

    let proportional = 0;
    if (rentalType === "weekly") {
      proportional = (item.unitPrice / 7) * usedDays;
    } else if (rentalType === "biweekly") {
      proportional = (item.unitPrice / 15) * usedDays;
    } else if (rentalType === "monthly") {
      proportional = (item.unitPrice / 30) * usedDays;
    } else {
      proportional = item.unitPrice * usedDays;
    }

    return Number((proportional * quantity).toFixed(2));
  }

  async returnRentalItems(
    companyId: string,
    rentalId: string,
    userId: string,
    payload: {
      returnDate?: Date;
      notes?: string;
      items: Array<{
        itemId: string;
        unitId?: string;
        returnedQuantity?: number;
        billingRentalType?: RentalType;
      }>;
    },
  ): Promise<IRental> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });
    if (!rental) {
      throw new Error("Aluguel não encontrado");
    }
    if (rental.status === "completed" || rental.status === "cancelled") {
      throw new Error("Não é possível devolver itens de aluguel finalizado/cancelado");
    }

    const finalReturnDateNorm = payload.returnDate
      ? this.normalizeDate(payload.returnDate)
      : this.normalizeDate(new Date());

    for (const reqItem of payload.items) {
      const idx = this.findOpenRentalItemIndex(
        rental.items,
        reqItem.itemId,
        reqItem.unitId,
      );
      if (idx === -1) {
        throw new Error(
          `Item ${reqItem.itemId} não encontrado no aluguel em aberto (ou já foi devolvido)`,
        );
      }
      const targetItem = rental.items[idx];

      const isUnit = Boolean(targetItem.unitId);
      const returnedQuantity = isUnit
        ? 1
        : Math.max(1, Math.min(reqItem.returnedQuantity || targetItem.quantity, targetItem.quantity));

      const pickupNorm = this.normalizeDate(
        new Date(targetItem.pickupScheduled || rental.dates.pickupScheduled),
      );
      const periodEndNorm = finalReturnDateNorm;

      /** Início típico: dia seguinte ao fim cobrado; às vezes lastBilling marca fim do 1º ciclo “previsto”, ainda não decorrido. */
      let periodStartRaw = targetItem.lastBillingDate
        ? this.addDays(this.normalizeDate(new Date(targetItem.lastBillingDate)), 1)
        : pickupNorm;

      /*
       * Ex.: locação desde 01/04, primeira cobrança mensal prevista até 29/04 (lastBilling já no item),
       * devolução 15/04: o próximo período técnico seria após essa mensal, ficando APÓS 15/04,
       * erroneamente bloqueando. Se o próximo período ficou depois da devolução, cobra desde retirada.
       */
      if (periodStartRaw.getTime() > periodEndNorm.getTime()) {
        periodStartRaw = pickupNorm;
      }

      if (periodStartRaw.getTime() < pickupNorm.getTime()) {
        periodStartRaw = pickupNorm;
      }

      if (periodEndNorm.getTime() <= periodStartRaw.getTime()) {
        throw new Error(
          "Data de devolução deve ser posterior ao início do período de cobrança",
        );
      }

      await this.deleteUnpaidBillingsOverlappingItemWindow(
        companyId,
        rental._id,
        targetItem.itemId,
        targetItem.unitId,
        periodStartRaw,
        periodEndNorm,
        buildRentalLineKey(targetItem as any),
      );

      const invForLine = await Item.findOne({
        _id: targetItem.itemId,
        companyId,
      });
      if (!invForLine) {
        throw new Error("Item do inventário não encontrado");
      }
      if (reqItem.billingRentalType) {
        this.assertConfiguredRateForRentalType(
          invForLine,
          reqItem.billingRentalType,
        );
      }

      await this.updateItemQuantityForRental(
        companyId,
        targetItem.itemId as any,
        returnedQuantity,
        "return",
        userId,
        rental._id,
        targetItem.unitId,
        rental.customerId.toString(),
      );

      const includeServices =
        (await Billing.countDocuments({ companyId, rentalId: rental._id })) === 0;

      const plainItem: any = JSON.parse(JSON.stringify(targetItem));
      const qtyToBill =
        returnedQuantity >= targetItem.quantity ? targetItem.quantity : returnedQuantity;

      const partialSplit = returnedQuantity < targetItem.quantity;
      const splitReturnedLineId = partialSplit ? randomUUID() : undefined;
      const splitRemainderLineId = partialSplit ? randomUUID() : undefined;

      const lineForBilling: any = {
        ...plainItem,
        quantity: qtyToBill,
      };
      if (partialSplit) {
        lineForBilling.lineId = splitReturnedLineId;
        lineForBilling.returnScheduled = periodEndNorm;
      }
      if (reqItem.billingRentalType) {
        lineForBilling.rentalType = reqItem.billingRentalType;
      }

      const createdBilling = await billingService.createPeriodicBillingForItem(
        companyId,
        rental,
        lineForBilling,
        periodStartRaw,
        periodEndNorm,
        userId,
        {
          includeServices,
          notes: payload.notes || (
            returnedQuantity >= targetItem.quantity
              ? "Fechamento por devolução"
              : "Fechamento por devolução parcial"
          ),
          status: "approved",
        },
      );

      const expectedKey = partialSplit ? buildRentalLineKey(lineForBilling) : "";
      const billingRow =
        (partialSplit && expectedKey
          ? (createdBilling.items || []).find(
              (row: any) => String(row.rentalLineKey || "") === expectedKey,
            )
          : undefined) ||
        (createdBilling.items || []).find((row: any) => {
          const sameItem =
            String(row.itemId) === String(targetItem.itemId);
          const sameUnit = targetItem.unitId
            ? row.unitId === targetItem.unitId
            : !row.unitId;
          return sameItem && sameUnit;
        });

      if (returnedQuantity >= targetItem.quantity) {
        targetItem.returnActual = periodEndNorm;
        targetItem.retroactiveOpenBilling = false;
        targetItem.lastBillingDate = periodEndNorm;
        targetItem.nextBillingDate = undefined;
        if (billingRow) {
          targetItem.unitPrice = Number(billingRow.unitPrice);
          targetItem.subtotal = Number(billingRow.subtotal);
        }
      } else {
        const returnedLine: any = {
          ...plainItem,
          _id: undefined,
          lineId: splitReturnedLineId,
          pickupScheduled: plainItem.pickupScheduled,
          returnScheduled: periodEndNorm,
          quantity: returnedQuantity,
          rentalType:
            reqItem.billingRentalType || plainItem.rentalType || "daily",
          unitPrice: billingRow ? Number(billingRow.unitPrice) : plainItem.unitPrice,
          subtotal: billingRow
            ? Number(billingRow.subtotal)
            : this.computeItemPartialSubtotal(
                {
                  ...(targetItem as any),
                  rentalType:
                    (reqItem.billingRentalType ||
                      targetItem.rentalType ||
                      "daily") as RentalType,
                },
                periodStartRaw,
                periodEndNorm,
                returnedQuantity,
              ),
          returnActual: periodEndNorm,
          retroactiveOpenBilling: false,
          lastBillingDate: periodEndNorm,
          nextBillingDate: undefined,
        };
        rental.items.push(returnedLine);

        const remainderType =
          (targetItem.rentalType || plainItem.rentalType || "daily") as RentalType;
        const { rate: remainderRate, message: remainderMsg } =
          periodRateFromInventory(invForLine.pricing, remainderType);
        if (remainderRate <= 0) {
          throw new Error(
            remainderMsg ||
              "Cadastre no equipamento o valor da cobrança do saldo (tipo do contrato restante).",
          );
        }

        const prevQty = plainItem.quantity;
        targetItem.lineId = splitRemainderLineId;
        /** Mesma data de retirada do contrato; o fim do período já coberto até a devolução parcial fica em lastBillingDate. */
        targetItem.pickupScheduled = this.normalizeDate(
          new Date(plainItem.pickupScheduled),
        );
        targetItem.quantity = prevQty - returnedQuantity;
        targetItem.unitPrice = remainderRate;
        targetItem.retroactiveOpenBilling = false;
        targetItem.lastBillingDate = periodEndNorm;
        const accrualStartAfterPartial = this.addDays(periodEndNorm, 1);
        targetItem.nextBillingDate = this.getPeriodEnd(
          this.normalizeDate(accrualStartAfterPartial),
          remainderType,
        );
        targetItem.subtotal = Number(
          ((Number(plainItem.subtotal || 0) * targetItem.quantity) / prevQty).toFixed(2),
        );
      }
    }

    if (payload.notes) {
      rental.notes = [rental.notes, `[Devolução] ${payload.notes}`]
        .filter(Boolean)
        .join("\n");
    }

    const allReturned = rental.items.every((item) => item.returnActual);
    if (allReturned) {
      rental.status = "ready_to_close";
      rental.dates.returnActual = finalReturnDateNorm;
    }

    await rental.save();
    await this.syncBillingsAfterRentalChange(companyId, rentalId, userId);

    const updated = await Rental.findOne({ _id: rentalId, companyId });
    return updated || rental;
  }

  /**
   * Confirma o fechamento final do aluguel (transição de ready_to_close → completed)
   * Deve ser chamado quando o usuário confirmar o fechamento após todos os itens serem devolvidos
   */
  async confirmRentalClosure(
    companyId: string,
    rentalId: string,
    userId: string,
  ): Promise<IRental> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw new Error("Aluguel não encontrado");
    }

    if (rental.status !== "ready_to_close") {
      throw new Error(
        `Apenas aluguéis em status "Pronto para fechar" podem ser finalizados. Status atual: ${rental.status}`,
      );
    }

    // Verifica se todos os itens foram realmente devolvidos
    const notReturned = rental.items.filter((item) => !item.returnActual);
    if (notReturned.length > 0) {
      throw new Error(
        `Não é possível finalizar: ${notReturned.length} item(ns) ainda não foi/foram devolvido(s)`,
      );
    }

    // Aplica a transição de status usando o método padrão
    await this.applyStatusChangeDirect(
      rental,
      "ready_to_close",
      "completed",
      companyId,
      userId,
    );

    await rental.save();
    return rental;
  }

  /**
   * Garante fechamento inicial + rascunho do próximo período para aluguéis reservados (todos os itens).
   */
  private async ensureReservedRentalBillings(
    companyId: string,
    rental: IRental,
    userId: string,
  ): Promise<{ created: number }> {
    let created = 0;
    let includeServicesAvailable =
      (await Billing.countDocuments({
        companyId,
        rentalId: rental._id,
      })) === 0;

    for (const item of rental.items) {
      if (!item.pickupScheduled && rental.dates.pickupScheduled) {
        item.pickupScheduled = rental.dates.pickupScheduled;
      }
      if (!item.pickupScheduled) {
        continue;
      }
      if (item.returnActual) {
        continue;
      }
      const rt = item.rentalType || "daily";
      const itemFilter: Record<string, unknown> = {
        companyId,
        rentalId: rental._id,
        "items.itemId": item.itemId,
        rentalType: rt,
        "items.rentalLineKey": buildRentalLineKey(item as any),
      };
      if (item.unitId) {
        itemFilter["items.unitId"] = item.unitId;
      }

      const periodStart = this.normalizeDate(item.pickupScheduled);
      let periodEnd = this.getPeriodEnd(periodStart, rt);
      const itemReturn = item.returnScheduled
        ? this.normalizeDate(item.returnScheduled)
        : undefined;
      if (itemReturn && itemReturn < periodEnd) {
        periodEnd = itemReturn;
      }

      const ps = this.normalizeDate(periodStart);
      const pe = this.normalizeDate(periodEnd);

      const existingFirst = await Billing.findOne({
        ...itemFilter,
        periodStart: ps,
        periodEnd: pe,
      }).lean();

      if (!existingFirst) {
        await billingService.createPeriodicBillingForItem(
          companyId,
          rental,
          item,
          ps,
          pe,
          userId,
          {
            includeServices: includeServicesAvailable,
            notes: "Fechamento inicial",
            status: "approved",
          },
        );
        includeServicesAvailable = false;
        created += 1;
      }

      item.lastBillingDate = pe;
      const nextStart = this.addDays(pe, 1);
      if (!itemReturn || itemReturn >= nextStart) {
        const nextEnd = this.getPeriodEnd(nextStart, rt);
        item.nextBillingDate = nextEnd;

        const ns = this.normalizeDate(nextStart);
        const ne = this.normalizeDate(nextEnd);

        const existingDraft = await Billing.findOne({
          ...itemFilter,
          periodStart: ns,
          periodEnd: ne,
        }).lean();

        if (!existingDraft) {
          await billingService.createPeriodicBillingForItem(
            companyId,
            rental,
            item,
            ns,
            ne,
            userId,
            {
              includeServices: false,
              notes: "Fechamento previsto",
              status: "draft",
            },
          );
          created += 1;
        }
      }
    }

    await rental.save();
    return { created };
  }

  /**
   * Cria fechamentos em falta e atualiza valores dos fechamentos em aberto conforme o aluguel atual.
   */
  async syncBillingsAfterRentalChange(
    companyId: string,
    rentalId: string,
    userId: string,
  ): Promise<{
    created: number;
    draftsCreated: number;
    refreshed: number;
  }> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });
    if (!rental) {
      throw new Error("Aluguel não encontrado");
    }
    if (rental.status === "completed" || rental.status === "cancelled") {
      return { created: 0, draftsCreated: 0, refreshed: 0 };
    }

    await this.removeObsoleteUnpaidBillingsForCurrentRental(companyId, rental);

    let created = 0;
    let draftsCreated = 0;

    if (rental.status === "reserved") {
      const r = await this.ensureReservedRentalBillings(
        companyId,
        rental,
        userId,
      );
      created += r.created;
    } else if (rental.status === "active" || rental.status === "overdue") {
      const r = await this.processDueBillings(companyId, rentalId, userId);
      created += r.created;
      draftsCreated += r.draftsCreated;
    } else if (rental.status === "ready_to_close") {
      await this.createFinalBillingIfNeeded(rental, userId);
      await rental.save();
    }

    let refreshed = 0;
    const openBillings = await Billing.find({
      companyId,
      rentalId: rental._id,
      status: { $nin: ["paid", "cancelled"] },
    }).select("_id");

    for (const b of openBillings) {
      try {
        await billingService.refreshBillingFromRental(
          companyId,
          String(b._id),
        );
        refreshed += 1;
      } catch {
        /* fechamento pode não ser recalculável neste estado */
      }
    }

    return { created, draftsCreated, refreshed };
  }

  /**
   * Para aluguéis sem nenhum fechamento: gera fechamentos e alinha totais.
   */
  async syncMissingBillingsForCompany(
    companyId: string,
    userId: string,
  ): Promise<{
    rentalsProcessed: number;
    created: number;
    draftsCreated: number;
    refreshed: number;
  }> {
    const statuses: RentalStatus[] = [
      "reserved",
      "active",
      "overdue",
      "ready_to_close",
    ];
    const rentals = await Rental.find({
      companyId,
      status: { $in: statuses },
    })
      .select("_id")
      .lean();

    let rentalsProcessed = 0;
    let created = 0;
    let draftsCreated = 0;
    let refreshed = 0;

    for (const r of rentals) {
      const hasBilling = await Billing.exists({
        companyId,
        rentalId: r._id,
      });
      if (hasBilling) {
        continue;
      }

      const sync = await this.syncBillingsAfterRentalChange(
        companyId,
        String(r._id),
        userId,
      );
      created += sync.created;
      draftsCreated += sync.draftsCreated;
      refreshed += sync.refreshed;
      rentalsProcessed += 1;
    }

    return { rentalsProcessed, created, draftsCreated, refreshed };
  }

  /**
   * Processa fechamentos periódicos para um aluguel ativo
   */
  async processDueBillings(
    companyId: string,
    rentalId: string,
    userId: string,
  ): Promise<{
    created: number;
    draftsCreated: number;
    skipReason?: "rental_not_active";
  }> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });
    if (!rental) {
      throw new Error("Aluguel não encontrado");
    }

    if (rental.status !== "active" && rental.status !== "overdue") {
      return { created: 0, draftsCreated: 0, skipReason: "rental_not_active" };
    }

    await this.removeObsoleteUnpaidBillingsForCurrentRental(companyId, rental);

    const now = this.normalizeDate(new Date());
    let createdCount = 0;
    let draftsCreated = 0;
    let includeServicesAvailable =
      (await Billing.countDocuments({
        companyId,
        rentalId: rental._id,
      })) === 0;

    for (const item of rental.items) {
      if (!item.pickupScheduled && rental.dates.pickupScheduled) {
        item.pickupScheduled = rental.dates.pickupScheduled;
      }
      if (!item.pickupScheduled) {
        continue;
      }
      if (item.returnActual) {
        continue;
      }
      const cycle: RentalType = item.rentalType || "daily";
      const pickupBase = this.normalizeDate(item.pickupScheduled);
      const horizon = this.getBillingHorizonForItem(item, now);
      const draftCap = this.getContractualReturnForDraft(item);

      const itemFilter: any = {
        companyId,
        rentalId: rental._id,
        "items.itemId": item.itemId,
        rentalType: cycle,
        "items.rentalLineKey": buildRentalLineKey(item as any),
      };
      if (item.unitId) {
        itemFilter["items.unitId"] = item.unitId;
      }

      if (cycle === "daily") {
        const dailyHorizon = item.returnActual
          ? this.normalizeDate(item.returnActual)
          : now;

        if (dailyHorizon.getTime() > pickupBase.getTime()) {
          const existingOpen = await Billing.findOne({
            ...itemFilter,
            periodStart: pickupBase,
            status: { $nin: ["paid", "cancelled"] },
          });

          if (existingOpen) {
            const currentEnd = this.normalizeDate(existingOpen.periodEnd);
            if (currentEnd.getTime() !== dailyHorizon.getTime()) {
              existingOpen.periodEnd = dailyHorizon;
              await existingOpen.save();
            }
            await billingService.refreshBillingFromRental(
              companyId,
              String(existingOpen._id),
            );
          } else {
            await billingService.createPeriodicBillingForItem(
              companyId,
              rental,
              item,
              pickupBase,
              dailyHorizon,
              userId,
              {
                includeServices: includeServicesAvailable,
                notes: "Fechamento diário",
              },
            );
            includeServicesAvailable = false;
            createdCount += 1;
          }

          item.lastBillingDate = item.returnActual ? dailyHorizon : undefined;
          item.nextBillingDate = undefined;
        }
        continue;
      }

      let lastBillingDate = item.lastBillingDate
        ? this.normalizeDate(item.lastBillingDate)
        : this.addDays(pickupBase, -1);
      let periodStart = this.addDays(lastBillingDate, 1);
      let expectedNextBillingDate = this.getPeriodEnd(periodStart, cycle);
      let nextBillingDate = item.nextBillingDate
        ? this.normalizeDate(item.nextBillingDate)
        : expectedNextBillingDate;
      if (
        nextBillingDate < periodStart ||
        nextBillingDate > expectedNextBillingDate
      ) {
        nextBillingDate = expectedNextBillingDate;
        item.nextBillingDate = expectedNextBillingDate;
      }

      while (nextBillingDate <= now && nextBillingDate <= horizon) {
        const existing = await Billing.findOne({
          ...itemFilter,
          periodStart: this.normalizeDate(periodStart),
          periodEnd: this.normalizeDate(nextBillingDate),
        }).lean();

        if (!existing) {
          await billingService.createPeriodicBillingForItem(
            companyId,
            rental,
            item,
            this.normalizeDate(periodStart),
            this.normalizeDate(nextBillingDate),
            userId,
            {
              includeServices: includeServicesAvailable,
              notes: "Fechamento periódico automático",
            },
          );
          includeServicesAvailable = false;
          createdCount += 1;
        } else {
          await billingService.refreshBillingFromRental(
            companyId,
            String(existing._id),
          );
        }

        item.lastBillingDate = this.normalizeDate(nextBillingDate);
        periodStart = this.addDays(nextBillingDate, 1);
        expectedNextBillingDate = this.getPeriodEnd(periodStart, cycle);
        item.nextBillingDate = expectedNextBillingDate;
        nextBillingDate = item.nextBillingDate;
      }

      /** Rascunho do período seguinte só se ainda há contrato em aberto (início deste período ≤ devolução prevista). */
      const draftAllowedByContract =
        draftCap === null ||
        this.normalizeDate(periodStart).getTime() <= draftCap.getTime();

      if (nextBillingDate > now && draftAllowedByContract) {
        const existingFuture = await Billing.findOne({
          ...itemFilter,
          periodStart: this.normalizeDate(periodStart),
          periodEnd: this.normalizeDate(nextBillingDate),
        }).lean();

        if (!existingFuture) {
          await billingService.createPeriodicBillingForItem(
            companyId,
            rental,
            item,
            this.normalizeDate(periodStart),
            this.normalizeDate(nextBillingDate),
            userId,
            {
              includeServices: false,
              notes: "Fechamento previsto",
              status: "draft",
            },
          );
          draftsCreated += 1;
        } else {
          await billingService.refreshBillingFromRental(
            companyId,
            String(existingFuture._id),
          );
        }
      }
    }

    await rental.save();

    const refreshableBillings = await Billing.find({
      companyId,
      rentalId: rental._id,
      status: { $nin: ["paid", "cancelled"] },
    }).select("_id");

    for (const billing of refreshableBillings) {
      try {
        await billingService.refreshBillingFromRental(
          companyId,
          String(billing._id),
        );
      } catch {
        /* Mantém o processamento dos demais fechamentos mesmo se um deles não puder ser recalculado. */
      }
    }

    return { created: createdCount, draftsCreated };
  }

  /**
   * Get all rentals with filters
   */
  async getRentals(
    companyId: string,
    filters: {
      status?: RentalStatus;
      customerId?: string;
      startDate?: Date;
      endDate?: Date;
      search?: string;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<{
    rentals: IRental[];
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

    if (filters.startDate || filters.endDate) {
      query.$or = [
        {
          "dates.pickupScheduled": {
            $gte: filters.startDate || new Date(0),
            $lte: filters.endDate || new Date(),
          },
        },
        {
          "dates.returnScheduled": {
            $gte: filters.startDate || new Date(0),
            $lte: filters.endDate || new Date(),
          },
        },
      ];
    }

    if (filters.search) {
      query.$or = [
        { rentalNumber: { $regex: filters.search, $options: "i" } },
        { notes: { $regex: filters.search, $options: "i" } },
      ];
    }

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const [rentals, total] = await Promise.all([
      Rental.find(query)
        .populate("customerId", "name cpfCnpj email phone")
        .populate("items.itemId", "name sku pricing")
        .populate("createdBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Rental.countDocuments(query),
    ]);

    return { rentals, total, page, limit };
  }

  /**
   * Get rental by ID
   */
  async getRentalById(
    companyId: string,
    rentalId: string,
  ): Promise<IRental | null> {
    return Rental.findOne({ _id: rentalId, companyId })
      .populate("customerId", "name cpfCnpj email phone addresses")
      .populate("items.itemId", "name sku pricing photos")
      .populate("createdBy", "name email")
      .populate("checklistPickup.completedBy", "name email")
      .populate("checklistReturn.completedBy", "name email");
  }

  private rentalTypeLabelForPdf(rt: RentalType | string): string {
    const m: Record<string, string> = {
      daily: "Diária",
      weekly: "Semanal",
      biweekly: "Quinzenal",
      monthly: "Mensal",
    };
    return m[String(rt)] || String(rt);
  }

  async generateRentalPDF(
    companyId: string,
    rentalId: string,
  ): Promise<Buffer> {
    const rental = await Rental.findOne({ _id: rentalId, companyId })
      .populate("customerId")
      .populate("items.itemId")
      .populate("companyId")
      .populate("createdBy", "name");

    if (!rental) {
      throw new Error("Rental not found");
    }

    const company = rental.companyId as any;
    const customer = rental.customerId as any;
    const createdBy = rental.createdBy as { name?: string } | null;

    const logoCandidates = [
      path.join(__dirname, "../../shared/imagens/alugue.png"),
      path.join(process.cwd(), "src/shared/imagens/alugue.png"),
      path.join(process.cwd(), "backend/src/shared/imagens/alugue.png"),
    ];
    const logoPath = logoCandidates.find((p) => fs.existsSync(p));
    const hasLogo = Boolean(logoPath);

    const customerAddresses = customer?.addresses || [];
    const preferredAddress =
      customerAddresses.find((addr: any) => addr.type === "billing") ||
      customerAddresses.find((addr: any) => addr.type === "main") ||
      customerAddresses[0];

    const work = rental.workAddress as IRentalWorkAddress | undefined;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 32, size: "A4" });
      const chunks: Buffer[] = [];

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageW = 595.28;
      const left = 32;
      const right = pageW - 32;
      const contentW = right - left;

      const fmtMoney = (n: number) =>
        `R$ ${Number(n || 0).toFixed(2).replace(".", ",")}`;
      const fmtDate = (d: Date | string | undefined) =>
        d ? new Date(d).toLocaleDateString("pt-BR") : "—";

      /** Cabeçalho do contrato físico ALUGUE (fixo no PDF) */
      const CONTRACT_HEADER_CNPJ_FALLBACK = "28.408.479/0001-19";
      const CONTRACT_HEADER_PHONES =
        "(35) 98843-5154 | (35) 99814-0522 | (35) 99761-2424";
      const CONTRACT_HEADER_ADDRESS =
        "Av. Gov. Valadares, 2586 - Jd São Carlos - CEP 37137-254 - Alfenas MG";

      const emission = new Date();

      const drawWatermark = () => {
        doc.save();
        doc.opacity(0.07);
        doc.fillColor("#aaaaaa");
        doc.fontSize(72).font("Helvetica-Bold");
        doc.text("ALUGUE", 130, 380, { lineBreak: false });
        doc.restore();
        doc.opacity(1);
        doc.fillColor("#000000");
      };

      drawWatermark();

      let y = 32;

      if (hasLogo && logoPath) {
        try {
          doc.image(logoPath, left, y, { width: 92 });
        } catch {
          /* ignora logo inválido */
        }
      }

      const headX = hasLogo ? left + 102 : left;
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#1e3a8a");
      doc.text(
        (company?.name || "ALUGUE EQUIPAMENTOS PARA CONSTRUÇÃO CIVIL").toUpperCase(),
        headX,
        y,
        { width: contentW - (hasLogo ? 102 : 0), align: "left" },
      );
      doc.fillColor("#000000");
      doc.font("Helvetica").fontSize(8.5);
      let hy = y + 16;
      const cnpjHeader =
        company?.cnpj?.trim() || CONTRACT_HEADER_CNPJ_FALLBACK;
      doc.text(`PIX    CNPJ: ${cnpjHeader}`, headX, hy, {
        width: contentW - (hasLogo ? 102 : 0),
      });
      hy += 11;
      doc.text(CONTRACT_HEADER_PHONES, headX, hy, {
        width: contentW - (hasLogo ? 102 : 0),
      });
      hy += 11;
      if (company?.email) {
        doc.text(`E-mail: ${company.email}`, headX, hy, {
          width: contentW - (hasLogo ? 102 : 0),
        });
        hy += 11;
      }
      doc.text(CONTRACT_HEADER_ADDRESS, headX, hy, {
        width: contentW - (hasLogo ? 102 : 0),
      });
      hy += 11;

      y = Math.max(y + 78, hy + 8);

      doc.font("Helvetica-Bold").fontSize(11).fillColor("#000000");
      doc.text(
        "CONTRATO DE LOCAÇÃO DE BENS MÓVEIS SEM OPERADOR",
        left,
        y,
        { width: contentW, align: "center" },
      );
      y += 22;

      const numStr = rental.rentalNumber || String(rental._id);
      doc.font("Helvetica").fontSize(9);
      doc.fillColor("#c00");
      doc.text(`№  ${numStr}`, right - 120, y - 18, { width: 120, align: "right" });
      doc.fillColor("#000000");

      doc.text(
        `Data: ${fmtDate(emission)}`,
        left,
        y,
        { width: 200 },
      );
      doc.text(
        `Elaborado por: ${createdBy?.name || "—"}`,
        left + 200,
        y,
        { width: contentW - 200, align: "right" },
      );
      y += 18;

      const lineField = (
        label: string,
        value: string,
        yy: number,
      ): number => {
        doc.font("Helvetica-Bold").fontSize(9).text(`${label}`, left, yy);
        doc.font("Helvetica").text(
          value || "________________________________________________________________",
          left + 110,
          yy,
          { width: contentW - 110 },
        );
        return yy + 14;
      };
      const locatarioLabelW = 72;
      const lineFieldLocatario = (
        label: string,
        value: string,
        yy: number,
      ): number => {
        doc.font("Helvetica-Bold").fontSize(9).text(`${label}`, left, yy, {
          width: locatarioLabelW,
          align: "left",
        });
        doc.font("Helvetica").text(
          value || "________________________________________________________________",
          left + locatarioLabelW,
          yy,
          { width: contentW - locatarioLabelW },
        );
        return yy + 14;
      };

      doc.font("Helvetica-Bold").fontSize(10).text("II — LOCATÁRIO", left, y);
      y += 14;
      {
        const rowY = y;
        const leftLabelW = 72;
        const rightLabelW = 46;
        const colGap = 12;
        const colW = (contentW - colGap) / 2;

        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .text("Nome:", left, rowY, { width: leftLabelW, align: "left" });
        doc
          .font("Helvetica")
          .fontSize(9)
          .text(
            customer?.name || "______________________________",
            left + leftLabelW,
            rowY,
            {
              width: colW - leftLabelW,
              align: "left",
            },
          );

        const rightX = left + colW + colGap;
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .text("Fone:", rightX, rowY, { width: rightLabelW, align: "left" });
        doc
          .font("Helvetica")
          .fontSize(9)
          .text(
            customer?.phone || "______________________________",
            rightX + rightLabelW,
            rowY,
            {
              width: colW - rightLabelW,
              align: "left",
            },
          );
        y = rowY + 14;
      }
      y = lineFieldLocatario("CNPJ / CPF:", customer?.cpfCnpj || "", y);

      const endCliente = preferredAddress
        ? [
            preferredAddress.street,
            preferredAddress.number ? `, ${preferredAddress.number}` : "",
            preferredAddress.complement ? ` - ${preferredAddress.complement}` : "",
          ].join("")
        : "";
      {
        const rowY = y;
        const leftLabelW = locatarioLabelW;
        const rightLabelW = 46;
        const colGap = 12;
        const colW = (contentW - colGap) / 2;
        const cidadeCliente = [
          preferredAddress?.city,
          preferredAddress?.state,
        ]
          .filter(Boolean)
          .join("/");

        doc.font("Helvetica-Bold").fontSize(9).text("End:", left, rowY, {
          width: leftLabelW,
          align: "left",
        });
        doc.font("Helvetica").fontSize(9).text(
          endCliente || "______________________________",
          left + leftLabelW,
          rowY,
          { width: colW - leftLabelW, align: "left" },
        );

        const rightX = left + colW + colGap;
        doc.font("Helvetica-Bold").fontSize(9).text("Cidade:", rightX, rowY, {
          width: rightLabelW,
          align: "left",
        });
        doc.font("Helvetica").fontSize(9).text(
          cidadeCliente || "______________________________",
          rightX + rightLabelW,
          rowY,
          { width: colW - rightLabelW, align: "left" },
        );
        y = rowY + 14;
      }
      y = lineFieldLocatario(
        "Bairro:",
        preferredAddress?.neighborhood || "",
        y,
      );
      {
        const rowY = y;
        const leftLabelW = 72;
        const rightLabelW = 46;
        const colGap = 12;
        const colW = (contentW - colGap) / 2;

        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .text("Representante:", left, rowY, {
            width: leftLabelW,
            align: "left",
          });
        doc
          .font("Helvetica")
          .fontSize(9)
          .text("______________________________", left + leftLabelW, rowY, {
            width: colW - leftLabelW,
            align: "left",
          });

        const rightX = left + colW + colGap;
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .text("Preposto:", rightX, rowY, {
            width: rightLabelW,
            align: "left",
          });
        doc
          .font("Helvetica")
          .fontSize(9)
          .text("______________________________", rightX + rightLabelW, rowY, {
            width: colW - rightLabelW,
            align: "left",
          });
        y = rowY + 14;
      }
      y += 4;

      doc.font("Helvetica-Bold").fontSize(10).text("III — OBRA", left, y);
      y += 14;
      {
        const rowY = y;
        const labelW = 28;
        const colGap = 12;
        const colW = (contentW - colGap) / 2;

        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .text("Nome:", left, rowY, { width: labelW, align: "left" });
        doc
          .font("Helvetica")
          .fontSize(9)
          .text(
            work?.workName || "______________________________",
            left + labelW,
            rowY,
            {
              width: colW - labelW,
              align: "left",
            },
          );

        const rightX = left + colW + colGap;
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .text("Fone:", rightX, rowY, { width: labelW, align: "left" });
        doc
          .font("Helvetica")
          .fontSize(9)
          .text("__________________________________________", rightX + labelW, rowY, {
            width: colW - labelW,
            align: "left",
          });
        y = rowY + 14;
      }
      const endObra = work
        ? [
            work.street,
            work.number ? `, ${work.number}` : "",
            work.complement ? ` - ${work.complement}` : "",
            work.neighborhood ? ` - ${work.neighborhood}` : "",
            work.zipCode ? ` - CEP ${work.zipCode}` : "",
          ]
            .filter(Boolean)
            .join("")
        : "";
      {
        const rowY = y;
        const labelW = 28;
        const rightLabelW = 46;
        const colGap = 12;
        const colW = (contentW - colGap) / 2;
        const cidadeObra = [work?.city, work?.state]
          .filter(Boolean)
          .join("/");

        doc.font("Helvetica-Bold").fontSize(9).text("End:", left, rowY, {
          width: labelW,
          align: "left",
        });
        doc.font("Helvetica").fontSize(9).text(
          endObra || "__________________________________________",
          left + labelW,
          rowY,
          { width: colW - labelW, align: "left" },
        );

        const rightX = left + colW + colGap;
        doc.font("Helvetica-Bold").fontSize(9).text("Cidade:", rightX, rowY, {
          width: rightLabelW,
          align: "left",
        });
        doc.font("Helvetica").fontSize(9).text(
          cidadeObra || "______________________________",
          rightX + rightLabelW,
          rowY,
          { width: colW - rightLabelW, align: "left" },
        );
        y = rowY + 14;
      }
      y += 6;

      if (y > 680) {
        doc.addPage();
        y = 32;
        drawWatermark();
      }

      doc.save();
      doc.rect(left, y, contentW, 22).fill("#000000");
      doc.fillColor("#ffffff");
      doc.font("Helvetica-Bold").fontSize(7.5);
      doc.text(
        "OBS. SÓ RETIRAMOS O(S) EQUIPAMENTO(S) COM A SOLICITAÇÃO DO CLIENTE, PESSOALMENTE OU POR TELEFONE.",
        left + 4,
        y + 6,
        { width: contentW - 8, align: "center" },
      );
      doc.restore();
      doc.fillColor("#000000");
      y += 30;

      doc.font("Helvetica-Bold").fontSize(10).text(
        "IV — CONDIÇÕES COMERCIAIS",
        left,
        y,
      );
      y += 12;

      const col = {
        q: left,
        cod: left + 28,
        desc: left + 78,
        unit: left + 300,
        per: left + 370,
        tot: left + 470,
      };
      const rowH = 14;

      const drawTableHeader = (yy: number) => {
        doc.font("Helvetica-Bold").fontSize(7);
        doc.text("Quant.", col.q, yy, { width: 24, align: "center" });
        doc.text("Cód.", col.cod, yy, { width: 44 });
        doc.text("DESCRIÇÃO DOS PRODUTOS", col.desc, yy, { width: 214 });
        doc.text("Valor Unit. Equip.", col.unit, yy, { width: 64, align: "right" });
        doc.text("Período", col.per, yy, { width: 96, align: "center" });
        doc.text("TOTAL R$", col.tot, yy, { width: right - col.tot, align: "right" });
        doc
          .moveTo(left, yy + 10)
          .lineTo(right, yy + 10)
          .strokeColor("#000000")
          .lineWidth(0.5)
          .stroke();
        return yy + 12;
      };

      y = drawTableHeader(y);
      doc.font("Helvetica").fontSize(7);

      rental.items.forEach((ritem: any) => {
        const inv = ritem.itemId as any;
        const name =
          inv && typeof inv === "object" && inv.name ? inv.name : "Item";
        const sku =
          inv?.sku || inv?.customId || inv?.barcode || "—";
        const pickup = ritem.pickupScheduled
          ? fmtDate(ritem.pickupScheduled)
          : "";
        const ret = ritem.returnScheduled
          ? fmtDate(ritem.returnScheduled)
          : "";
        const periodLabel =
          pickup && ret
            ? `${pickup} a ${ret}`
            : this.rentalTypeLabelForPdf(ritem.rentalType || "daily");
        const lineTotal = Number(ritem.subtotal ?? 0);

        if (y > 720) {
          doc.addPage();
          y = 32;
          drawWatermark();
          y = drawTableHeader(y);
          doc.font("Helvetica").fontSize(7);
        }

        doc.text(String(ritem.quantity), col.q, y, { width: 24, align: "center" });
        doc.text(String(sku).slice(0, 12), col.cod, y, { width: 44 });
        doc.text(name, col.desc, y, { width: 214 });
        doc.text(fmtMoney(ritem.unitPrice), col.unit, y, {
          width: 64,
          align: "right",
        });
        doc.text(periodLabel, col.per, y, { width: 96, align: "center" });
        doc.text(fmtMoney(lineTotal), col.tot, y, {
          width: right - col.tot,
          align: "right",
        });
        y += rowH;
      });

      if (rental.services && rental.services.length > 0) {
        rental.services.forEach((s: any) => {
          const qty = Number(s.quantity || 1);
          const lineTotal = Number(
            s.subtotal ?? s.price * qty,
          );
          if (y > 720) {
            doc.addPage();
            y = 32;
            drawWatermark();
            y = drawTableHeader(y);
            doc.font("Helvetica").fontSize(7);
          }
          doc.text(String(qty), col.q, y, { width: 24, align: "center" });
          doc.text("SERV", col.cod, y, { width: 44 });
          doc.text(s.description || "Serviço", col.desc, y, { width: 214 });
          doc.text(fmtMoney(s.price), col.unit, y, {
            width: 64,
            align: "right",
          });
          doc.text("Único", col.per, y, { width: 96, align: "center" });
          doc.text(fmtMoney(lineTotal), col.tot, y, {
            width: right - col.tot,
            align: "right",
          });
          y += rowH;
        });
      }

      doc
        .moveTo(left, y)
        .lineTo(right, y)
        .strokeColor("#000000")
        .lineWidth(0.5)
        .stroke();
      y += 8;

      const sumItems = rental.items.reduce(
        (acc: number, it: any) => acc + Number(it.subtotal ?? 0),
        0,
      );
      const sumServices =
        rental.services?.reduce(
          (acc: number, s: any) =>
            acc +
            Number(s.subtotal ?? s.price * (s.quantity || 1)),
          0,
        ) ?? 0;
      const subtotalTable = sumItems + sumServices;
      const discount = Number(rental.pricing?.discount ?? 0);
      const contractTotal =
        rental.pricing?.total != null
          ? Number(rental.pricing.total)
          : Math.max(0, subtotalTable - discount);

      if (discount > 0) {
        doc.font("Helvetica").fontSize(8);
        doc.text("Subtotal:", col.tot - 120, y, { width: 100, align: "right" });
        doc.text(fmtMoney(subtotalTable), col.tot, y, {
          width: right - col.tot,
          align: "right",
        });
        y += rowH;
        doc.text("Desconto:", col.tot - 120, y, { width: 100, align: "right" });
        doc.text(fmtMoney(discount), col.tot, y, {
          width: right - col.tot,
          align: "right",
        });
        y += rowH;
      }

      doc.font("Helvetica-Bold").fontSize(9);
      doc.text("TOTAL LOCAÇÃO:", col.tot - 120, y, { width: 100, align: "right" });
      doc.text(fmtMoney(contractTotal), col.tot, y, {
        width: right - col.tot,
        align: "right",
      });
      y += rowH + 6;
      if (y > 520) {
        doc.addPage();
        y = 32;
        drawWatermark();
      }

      doc.font("Helvetica-Bold").fontSize(10).text("V — DECLARAÇÃO", left, y);
      y += 12;
      doc.font("Helvetica").fontSize(7.5).text(
        [
          "O LOCATÁRIO recebe neste ato, ou na entrega, por si ou por seu preposto, o(s) bem(ns) móvel(is) referido(s) no presente instrumento, e declara: ",
          "A) Tê-lo(s) testado(s) e aprovado(s), afirmando que conhece sua correta utilização e funcionamento, pelo que se obriga a devolvê-lo(s) em idênticas condições de funcionamento, limpeza e segurança, ao final desta locação ou na hipótese de rescisão do presente contrato.",
          "B) Que somente permitirá o uso do(s) equipamento(s) por profissional(is) qualificado(s) para operá-lo(s).",
          "C) Que fará uso de todos os equipamentos de segurança (EPIs) necessários à utilização do(s) bem(ns) móvel(is) alugado(s), bem como das normas de segurança pertinentes.",
          "D) Ter ciência de que a prorrogação do CONTRATO é automática e por igual período, sucessivamente.",
          "E) Ter ciência de que o equipamento deverá ser devolvido na loja ou que deverá protocolar a solicitação de retirada por meio do telefone: (35) 98843-5154, sendo o protocolo a prova da solicitação.",
          "F) Constituem parte integrante deste CONTRATO as 'CONDIÇÕES GERAIS DO CONTRATO DE LOCAÇÃO DE BENS MÓVEIS – SEM OPERADOR', podendo ser solicitadas pelo locatário a qualquer momento por e-mail ou WhatsApp.",
          "G) No caso de locação de CONTAINER, na ocorrência de dano parcial ou total, queda, uso inadequado, furto, roubo, motivo de força maior, extravio ou qualquer outro motivo de perda ou desaparecimento do(s) bem(ns) não especificado(s) neste instrumento que o LOCATÁRIO armazenar ou guardar no CONTAINER, será de exclusiva responsabilidade do LOCATÁRIO, excluindo-se a ALUGUE de quaisquer responsabilidades, inclusive de natureza indenizatória, a qualquer título.",
        ].join(" "),
        left,
        y,
        {
          width: contentW,
          align: "justify",
          lineGap: 1,
        },
      );
      y = doc.y + 10;

      doc.font("Helvetica-Bold").fontSize(10).text("VI — OBSERVAÇÕES", left, y);
      y += 12;
      doc.font("Helvetica").fontSize(9);
      const obsText = rental.notes?.trim() || "";
      doc.text(obsText || " ", left, y, { width: contentW, height: 44 });
      doc
        .moveTo(left, doc.y + 2)
        .lineTo(right, doc.y + 2)
        .strokeColor("#999999")
        .lineWidth(0.3)
        .stroke();
      y = doc.y + 14;

      if (y > 640) {
        doc.addPage();
        y = 32;
        drawWatermark();
      }

      y = Math.max(y, 600);
      doc.font("Helvetica").fontSize(8);
      doc.text("LOCATÁRIO: ___________________________________________", left, y);
      doc.text(
        "LOCADORA: ___________________________________________",
        left + 260,
        y,
      );
      y += 22;
      doc.text("RECEBIDO POR: _______________________________________", left, y);
      doc.text("RG: __________________________________________________", left + 260, y);
      y += 18;
      doc.font("Helvetica").fontSize(7).fillColor("#555555");
      
      doc.end();
    });
  }

  private calculateFinalPricing(rental: any, returnDateOverride?: Date) {
    const pickupDate =
      rental.dates.pickupActual || rental.dates.pickupScheduled;

    const returnDate = returnDateOverride || new Date();

    const diffMs = returnDate.getTime() - pickupDate.getTime();
    const usedDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    // Recalcular o subtotal dos equipamentos baseado nos dias utilizados
    let recalculatedEquipmentSubtotal = 0;
    for (const item of rental.items) {
      const { unitPrice, rentalType, quantity } = item;
      let proportional = 0;

      if (rentalType === "weekly") {
        proportional = (unitPrice / 7) * usedDays;
      } else if (rentalType === "biweekly") {
        proportional = (unitPrice / 15) * usedDays;
      } else if (rentalType === "monthly") {
        proportional = (unitPrice / 30) * usedDays;
      } else {
        // daily - sem divisão necessária
        proportional = unitPrice * usedDays;
      }

      recalculatedEquipmentSubtotal += proportional * quantity;
    }

    const recalculatedTotal =
      recalculatedEquipmentSubtotal +
      (rental.pricing.servicesSubtotal || 0) -
      (rental.pricing.discount || 0) +
      (rental.pricing.lateFee || 0);

    return {
      usedDays,
      recalculatedEquipmentSubtotal,
      recalculatedTotal,
      returnDate,
    };
  }

  private async recalcPricingForRental(
    rental: IRental,
    companyId: string,
  ): Promise<void> {
    let equipmentSubtotal = 0;

    for (const item of rental.items) {
      const inventoryItem = await Item.findOne({ _id: item.itemId, companyId });
      if (!inventoryItem) {
        throw new Error(`Item ${item.itemId} not found`);
      }

      const pickupScheduled =
        item.pickupScheduled || rental.dates.pickupScheduled;
      const returnScheduled = item.returnScheduled;
      const pricingEndDate =
        returnScheduled ||
        this.getPricingEndDate(pickupScheduled, item.rentalType);

      const price = this.calculateRentalPrice(
        inventoryItem.pricing.dailyRate,
        inventoryItem.pricing.weeklyRate,
        inventoryItem.pricing.biweeklyRate,
        inventoryItem.pricing.monthlyRate,
        pickupScheduled,
        pricingEndDate,
        item.rentalType,
      );
      const subtotal = price * item.quantity;

      item.unitPrice = price;
      item.subtotal = subtotal;

      equipmentSubtotal += subtotal;
    }

    rental.pricing.equipmentSubtotal = Number(equipmentSubtotal.toFixed(2));
    rental.pricing.originalEquipmentSubtotal = Number(
      equipmentSubtotal.toFixed(2),
    );
    rental.pricing.subtotal = Number(
      (equipmentSubtotal + rental.pricing.servicesSubtotal).toFixed(2),
    );
    rental.pricing.total = Number(
      Math.max(
        0,
        rental.pricing.subtotal +
          -rental.pricing.discount +
          rental.pricing.lateFee,
      ).toFixed(2),
    );
  }

  private async applyStatusChangeDirect(
    rental: IRental,
    oldStatus: RentalStatus,
    newStatus: RentalStatus,
    companyId: string,
    userId: string,
    adjustments?: {
      returnDate?: Date;
      pricingOverride?: {
        equipmentSubtotal?: number;
        servicesSubtotal?: number;
        discount?: number;
        lateFee?: number;
        total?: number;
      };
    },
  ): Promise<void> {
    console.log("[INFO] FLUXO DE STATUS:", oldStatus, "→", newStatus);

    // 🔒 Proteção contra execução duplicada ou inválida
    if (oldStatus === newStatus) {
      console.warn("[AVISO] Tentativa de mudança de status redundante");
      return;
    }

    rental.status = newStatus;

    /**
     * RESERVED → ACTIVE
     */
    if (oldStatus === "reserved" && newStatus === "active") {
      rental.dates.pickupActual = new Date();

      if (!rental.dates.lastBillingDate) {
        const basePickup = this.normalizeDate(rental.dates.pickupScheduled);
        rental.dates.lastBillingDate = this.addDays(basePickup, -1);
      }

      if (
        !rental.dates.nextBillingDate &&
        rental.dates.billingCycle &&
        rental.dates.billingCycle !== "daily"
      ) {
        const basePickup = this.normalizeDate(rental.dates.pickupScheduled);
        rental.dates.nextBillingDate = this.getPeriodEnd(
          basePickup,
          rental.dates.billingCycle,
        );
      }

      for (const item of rental.items) {
        const itemDoc = await Item.findOne({ _id: item.itemId, companyId });

        if (!itemDoc) {
          console.error(
            "[ERRO] Item não encontrado durante ativação do aluguel:",
            { itemId: item.itemId, rentalId: rental._id }
          );
          continue;
        }

        // =========================
        // ITEM UNITÁRIO
        // =========================
        if (itemDoc.trackingType === "unit") {
          const unit = itemDoc.units?.find((u) => u.unitId === item.unitId);

          console.log(
            "[INFO] Ativando unidade:",
            { itemId: item.itemId, unitId: item.unitId, status: unit?.status }
          );

          if (unit?.status === "rented") {
            console.warn(
              `[AVISO] Unidade ${item.unitId} já está alugada`
            );
            continue;
          }

          if (!unit) {
            console.warn(
              `[AVISO] Unidade não encontrada durante ativação: ${item.unitId}`
            );
            continue;
          }

          if (unit.status !== "reserved") {
            console.warn(
              `[AVISO] Unidade ${item.unitId} não está em status "reservada" (status=${unit.status}), pulando ativação`
            );
            continue;
          }

          await this.updateItemQuantityForRental(
            companyId,
            item.itemId,
            item.quantity,
            "activate",
            userId,
            rental._id,
            item.unitId,
            rental.customerId.toString(),
          );
        } else {
          // =========================
          // ITEM QUANTITATIVO
          // =========================
          console.log(
            "[INFO] Ativando item quantitativo:",
            { itemId: item.itemId, quantidade: item.quantity }
          );

          await this.updateItemQuantityForRental(
            companyId,
            item.itemId,
            item.quantity,
            "activate",
            userId,
            rental._id,
            undefined, // sem unitId para quantitativos
            rental.customerId.toString(),
          );
        }
      }
    }

    /**
     * ACTIVE / OVERDUE → COMPLETED
     */
    if (
      (oldStatus === "active" || oldStatus === "overdue") &&
      newStatus === "completed"
    ) {
      const { usedDays, recalculatedEquipmentSubtotal, returnDate } =
        this.calculateFinalPricing(rental, adjustments?.returnDate);

      rental.dates.returnActual = returnDate;

      for (const item of rental.items) {
        if (!item.returnActual) {
          item.returnActual = returnDate;
        }
      }

      rental.pricing.originalEquipmentSubtotal =
        rental.pricing.equipmentSubtotal;

      rental.pricing.equipmentSubtotal = Number(
        recalculatedEquipmentSubtotal.toFixed(2),
      );

      rental.pricing.subtotal = Number(
        (
          rental.pricing.equipmentSubtotal + rental.pricing.servicesSubtotal
        ).toFixed(2),
      );

      rental.pricing.total = Number(
        Math.max(
          0,
          rental.pricing.subtotal +
            -rental.pricing.discount +
            rental.pricing.lateFee,
        ).toFixed(2),
      );

      rental.pricing.usedDays = usedDays;

      if (adjustments?.pricingOverride) {
        const override = adjustments.pricingOverride;

        if (override.equipmentSubtotal !== undefined) {
          rental.pricing.equipmentSubtotal = override.equipmentSubtotal;
        }

        if (override.servicesSubtotal !== undefined) {
          rental.pricing.servicesSubtotal = override.servicesSubtotal;
        }

        if (override.discount !== undefined) {
          rental.pricing.discount = override.discount;
        }

        if (override.lateFee !== undefined) {
          rental.pricing.lateFee = override.lateFee;
        }

        rental.pricing.subtotal = Number(
          (
            rental.pricing.equipmentSubtotal + rental.pricing.servicesSubtotal
          ).toFixed(2),
        );

        rental.pricing.total =
          override.total !== undefined
            ? override.total
            : Number(
                (
                  rental.pricing.subtotal +
                  -rental.pricing.discount +
                  rental.pricing.lateFee
                ).toFixed(2),
              );
      }

      for (const item of rental.items) {
        const itemDoc = await Item.findOne({ _id: item.itemId, companyId });

        if (!itemDoc) {
          console.error(
            "[ERRO] Item não encontrado durante devolução do aluguel:",
            { itemId: item.itemId, rentalId: rental._id }
          );
          continue;
        }

        // =========================
        // ITEM UNITÁRIO
        // =========================
        if (itemDoc.trackingType === "unit") {
          const unit = itemDoc.units?.find((u) => u.unitId === item.unitId);

          console.log(
            "[INFO] Devolvendo unidade:",
            { itemId: item.itemId, unitId: item.unitId, status: unit?.status }
          );

          // 🔒 Proteção contra retorno indevido
          if (unit?.status === "reserved") {
            console.warn(
              `[AVISO] Tentativa de devolução com unidade ainda reservada: ${item.unitId}`
            );
            continue;
          }

          if (!unit) {
            console.warn(
              `[AVISO] Unidade não encontrada durante devolução: ${item.unitId}`
            );
            continue;
          }

          if (unit.status !== "rented") {
            console.warn(
              `[AVISO] Unidade ${item.unitId} não está em status "alugada" (status=${unit.status}), pulando devolução`
            );
            continue;
          }

          await this.updateItemQuantityForRental(
            companyId,
            item.itemId,
            item.quantity,
            "return",
            userId,
            rental._id,
            item.unitId,
            rental.customerId.toString(),
          );
        } else {
          // =========================
          // ITEM QUANTITATIVO
          // =========================
          console.log(
            "[INFO] Devolvendo item quantitativo:",
            { itemId: item.itemId, quantidade: item.quantity }
          );

          await this.updateItemQuantityForRental(
            companyId,
            item.itemId,
            item.quantity,
            "return",
            userId,
            rental._id,
            undefined, // sem unitId para quantitativos
            rental.customerId.toString(),
          );
        }
      }
    }

    /**
     * RESERVED → CANCELLED
     */
    if (oldStatus === "reserved" && newStatus === "cancelled") {
      console.log(
        "[INFO] Cancelando aluguel e liberando itens reservados:",
        { rentalId: rental._id }
      );

      for (const item of rental.items) {
        const itemDoc = await Item.findOne({ _id: item.itemId, companyId });

        if (!itemDoc) {
          console.warn(
            "[AVISO] Item não encontrado durante cancelamento do aluguel:",
            { itemId: item.itemId }
          );
          continue;
        }

        await this.updateItemQuantityForRental(
          companyId,
          item.itemId,
          item.quantity,
          "cancel",
          userId,
          rental._id,
          item.unitId,
          rental.customerId.toString(),
        );
      }
    }

    /**
     * READY_TO_CLOSE → COMPLETED
     * Transição final do aluguel após todos os itens serem devolvidos
     * 
     * IMPORTANTE: Os valores de preço já foram calculados no closeRentalItem
     * para cada item individual. NÃO devemos recalcular aqui.
     */
    if (oldStatus === "ready_to_close" && newStatus === "completed") {
      // Marca data de conclusão
      rental.dates.returnActual = rental.dates.returnActual || new Date();

      // Garante que todos os itens tenham returnActual
      for (const item of rental.items) {
        if (!item.returnActual) {
          item.returnActual = rental.dates.returnActual;
        }
      }

      // Os valores de pricing já foram recalculados em closeRentalItem
      // Apenas garantimos que o total não seja negativo (proteção contra erros)
      rental.pricing.total = Math.max(0, rental.pricing.total || 0);

      // Nota: As unidades já foram retornadas por closeRentalItem
      // apenas confirmamos que o aluguel está finalizado
      console.log("[SUCESSO] Aluguel finalizado com êxito:", rental._id);
    }
  }

  private async createFinalBillingIfNeeded(
    rental: IRental,
    userId: string,
  ): Promise<void> {
    let includeServicesAvailable =
      (await Billing.countDocuments({
        companyId: rental.companyId,
        rentalId: rental._id,
      })) === 0;

    for (const item of rental.items) {
      const itemReturn = item.returnActual || item.returnScheduled;
      if (!itemReturn) {
        continue;
      }
      if (!item.pickupScheduled && rental.dates.pickupScheduled) {
        item.pickupScheduled = rental.dates.pickupScheduled;
      }
      if (!item.pickupScheduled) {
        continue;
      }

      const lastBilling = item.lastBillingDate;
      const periodStart = lastBilling
        ? this.addDays(lastBilling, 1)
        : item.pickupScheduled;
      const periodEnd = itemReturn;

      if (!periodStart || periodEnd <= periodStart) {
        continue;
      }

      const existing = await Billing.findOne({
        companyId: rental.companyId,
        rentalId: rental._id,
        "items.itemId": item.itemId,
        ...(item.unitId ? { "items.unitId": item.unitId } : {}),
        "items.rentalLineKey": buildRentalLineKey(item as any),
        periodStart,
        periodEnd,
      }).lean();

      if (existing) {
        continue;
      }

      await billingService.createPeriodicBillingForItem(
        rental.companyId.toString(),
        rental,
        item,
        periodStart,
        periodEnd,
        userId,
        {
          includeServices: includeServicesAvailable,
          notes: "Fechamento final do aluguel",
        },
      );
      includeServicesAvailable = false;

      item.lastBillingDate = periodEnd;
      item.nextBillingDate = undefined;
    }
  }

  /**
   * Update rental status
   */
  async updateRentalStatus(
    companyId: string,
    rentalId: string,
    status: RentalStatus,
    userId: string,
    adjustments?: {
      returnDate?: Date;
      rentalType?: RentalType;
      pricingOverride?: {
        equipmentSubtotal?: number;
        servicesSubtotal?: number;
        discount?: number;
        lateFee?: number;
        total?: number;
      };
      notes?: string;
    },
  ): Promise<UpdateRentalStatusResponse> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });
    if (!rental) {
      throw new Error("Rental not found");
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new Error("Usuário não encontrado");
    }

    const isAdmin = canUpdateRentalStatus(user.role as RoleType);

    if (adjustments && status !== "completed") {
      throw new Error("Ajustes só podem ser enviados no fechamento do aluguel");
    }

    // funcionário → cria solicitação
    if (!isAdmin) {
      if (status === "completed" && adjustments) {
        await this.requestApproval(
          companyId,
          rentalId,
          "close_adjustment",
          {
            previousStatus: rental.status,
            newStatus: status,
            previousValue: rental.status,
            newValue: status,
            adjustments,
          },
          userId,
          adjustments.notes || `Solicitação de fechamento com ajustes`,
        );

        await notificationService.notifyStatusChangeRequest({
          title: "Solicitação de alteração de status",
          message: `O funcionário ${user.name} solicitou fechar o aluguel com ajustes`,
          companyId,
          createdByUserId: userId,
          referenceId: rentalId,
          requestedStatus: status,
        });

        return {
          success: true,
          message: "Solicitação enviada para aprovação",
          data: rental,
          requiresApproval: true,
        };
      }

      await this.requestApproval(
        companyId,
        rentalId,
        "status_change",
        {
          previousStatus: rental.status,
          newStatus: status,
          previousValue: rental.status,
          newValue: status,
        },
        userId,
        `Solicitação de alteração de status para ${status}`,
      );

      await notificationService.notifyStatusChangeRequest({
        title: "Solicitação de alteração de status",
        message: `O funcionário ${user.name} solicitou alterar o status do aluguel para ${status}`,
        companyId,
        createdByUserId: userId,
        referenceId: rentalId,
        requestedStatus: status,
      });

      return {
        success: true,
        message: "Solicitação enviada para aprovação",
        data: rental,
        requiresApproval: true,
      };
    }
    const oldStatus = rental.status;

    // trava mudança inválida
    if (oldStatus === status) {
      return {
        success: true,
        message: "Status já estava definido",
        data: rental,
      };
    }

    await this.applyStatusChangeDirect(
      rental,
      oldStatus,
      status,
      companyId,
      userId,
      adjustments,
    );

    if (status === "completed") {
      await this.processDueBillings(companyId, rentalId, userId);
    }

    if (status === "completed" && adjustments?.rentalType) {
      for (const item of rental.items) {
        item.rentalType = adjustments.rentalType;
      }
      rental.dates.billingCycle = adjustments.rentalType;
      await this.recalcPricingForRental(rental, companyId);
    }

    if (status === "completed") {
      await this.createFinalBillingIfNeeded(rental, userId);
    }

    await this.addChangeHistory(
      rental,
      "status_change",
      oldStatus,
      status,
      userId,
      adjustments?.notes,
    );

    await rental.save();

    return {
      success: true,
      message: "Status alterado com sucesso",
      data: rental,
    };
  }

  /**
   * Extend rental period
   */
  async extendRental(
    companyId: string,
    rentalId: string,
    newReturnDate: Date,
    userId: string,
  ): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw new Error("Rental not found");
    }

    if (rental.status !== "active" && rental.status !== "reserved") {
      throw new Error("Can only extend active or reserved rentals");
    }

    const oldReturnDate = rental.dates.returnScheduled;
    rental.dates.returnScheduled = new Date(newReturnDate);

    // Recalculate pricing
    let totalSubtotal = 0;
    for (const item of rental.items) {
      const inventoryItem = await Item.findOne({ _id: item.itemId, companyId });
      if (inventoryItem) {
        const price = this.calculateRentalPrice(
          inventoryItem.pricing.dailyRate,
          inventoryItem.pricing.weeklyRate,
          inventoryItem.pricing.biweeklyRate,
          inventoryItem.pricing.monthlyRate,
          rental.dates.pickupScheduled,
          rental.dates.returnScheduled,
          item.rentalType,
        );
        const subtotal = price * item.quantity;
        totalSubtotal += subtotal;
      }
    }

    rental.pricing.subtotal = totalSubtotal;
    rental.pricing.total = Math.max(
      0,
      totalSubtotal - rental.pricing.discount + (rental.pricing.lateFee || 0),
    );

    await rental.save();
    await this.syncBillingsAfterRentalChange(companyId, rentalId, userId);
    return Rental.findOne({ _id: rentalId, companyId });
  }

  /**
   * Update pickup checklist
   */
  async updatePickupChecklist(
    companyId: string,
    rentalId: string,
    checklist: any,
    userId: string,
  ): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw new Error("Rental not found");
    }

    rental.checklistPickup = {
      ...checklist,
      completedAt: new Date(),
      completedBy: userId,
    };

    await rental.save();
    return rental;
  }

  /**
   * Update return checklist
   */
  async updateReturnChecklist(
    companyId: string,
    rentalId: string,
    checklist: any,
    userId: string,
  ): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw new Error("Rental not found");
    }

    rental.checklistReturn = {
      ...checklist,
      completedAt: new Date(),
      completedBy: userId,
    };

    await rental.save();
    return rental;
  }

  /**
   * Update rental (general update)
   */
  async updateRental(
    companyId: string,
    rentalId: string,
    data: any,
    userId: string,
  ): Promise<{ rental: IRental; requiresApproval: boolean }> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw new Error("Rental not found");
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new Error("Usuário não encontrado");
    }

    const changes: Record<string, any> = {};
    const dateChanges: Record<string, any> = {};
    const itemChanges: Record<string, any>[] = [];
    const workAddressChanged = data.workAddress !== undefined;
    const itemUpdates = Array.isArray(data.items) ? data.items : [];
    if (itemUpdates.length > 0) {
      for (const itemUpdate of itemUpdates) {
        const existingItem = rental.items.find(
          (i) =>
            i.itemId.toString() === itemUpdate.itemId &&
            (itemUpdate.unitId ? i.unitId === itemUpdate.unitId : !i.unitId),
        );
        itemChanges.push({
          itemId: itemUpdate.itemId,
          unitId: itemUpdate.unitId,
          isNew: !existingItem,
          previousRentalType: existingItem?.rentalType,
          newRentalType: itemUpdate.rentalType,
          previousPickupScheduled: existingItem?.pickupScheduled,
          newPickupScheduled: itemUpdate.pickupScheduled,
          previousReturnScheduled: existingItem?.returnScheduled,
          newReturnScheduled: itemUpdate.returnScheduled,
          quantity: itemUpdate.quantity,
        });
      }
    }

    if (data.dates?.pickupScheduled) {
      const newPickup = new Date(data.dates.pickupScheduled);
      if (rental.dates.pickupScheduled.getTime() !== newPickup.getTime()) {
        dateChanges.pickupScheduled = {
          previous: rental.dates.pickupScheduled,
          next: newPickup,
        };
      }
    }

    if (data.dates?.returnScheduled) {
      const newReturn = new Date(data.dates.returnScheduled);
      if (rental.dates.returnScheduled.getTime() !== newReturn.getTime()) {
        dateChanges.returnScheduled = {
          previous: rental.dates.returnScheduled,
          next: newReturn,
        };
      }
    }

    // Only allow updates to certain fields
    if (data.notes !== undefined) {
      changes.notes = {
        previous: rental.notes || "",
        next: data.notes || "",
      };
    }

    if (workAddressChanged) {
      rental.workAddress = data.workAddress
        ? {
            street: data.workAddress.street,
            number: data.workAddress.number,
            complement: data.workAddress.complement,
            neighborhood: data.workAddress.neighborhood,
            city: data.workAddress.city,
            state: data.workAddress.state,
            zipCode: data.workAddress.zipCode,
            workName: data.workAddress.workName,
            workId:
              data.workAddress.workId &&
              mongoose.Types.ObjectId.isValid(data.workAddress.workId)
                ? new mongoose.Types.ObjectId(data.workAddress.workId)
                : undefined,
          }
        : undefined;
    }

    const hasChanges = Object.keys(changes).length > 0;
    const hasDateChanges = Object.keys(dateChanges).length > 0;
    const hasItemChanges = itemUpdates.length > 0;

    if (
      !hasChanges &&
      !hasDateChanges &&
      !workAddressChanged &&
      !hasItemChanges
    ) {
      return { rental, requiresApproval: false };
    }

    if (
      !canUpdateRentalStatus(user.role as RoleType) &&
      (hasChanges || hasDateChanges || hasItemChanges)
    ) {
      await this.requestApproval(
        companyId,
        rentalId,
        "rental_update",
        {
          previousNotes: changes.notes?.previous,
          newNotes: changes.notes?.next,
          previousPickupScheduled: dateChanges.pickupScheduled?.previous,
          newPickupScheduled: dateChanges.pickupScheduled?.next,
          previousReturnScheduled: dateChanges.returnScheduled?.previous,
          newReturnScheduled: dateChanges.returnScheduled?.next,
          items: itemChanges,
          previousValue: "rental_update",
          newValue: "rental_update",
        },
        userId,
        "Solicitação de edição do aluguel",
      );

      await rental.save();
      return { rental, requiresApproval: true };
    }

    if (changes.notes) {
      rental.notes = changes.notes.next;
    }

    if (dateChanges.pickupScheduled) {
      rental.dates.pickupScheduled = dateChanges.pickupScheduled.next;
    }

    if (dateChanges.returnScheduled) {
      rental.dates.returnScheduled = dateChanges.returnScheduled.next;
    }

    if (hasItemChanges) {
      const changedItems: Array<{ itemId: string; unitId?: string }> = [];
      for (const itemUpdate of itemUpdates) {
        const inventoryItem = await Item.findOne({
          _id: itemUpdate.itemId,
          companyId,
        });
        if (!inventoryItem) {
          throw new Error(`Item ${itemUpdate.itemId} not found`);
        }

        const isUnit = inventoryItem.trackingType === "unit";
        if (isUnit && !itemUpdate.unitId) {
          throw new Error(
            `Item ${inventoryItem.name} is unit-based. Please specify unitId.`,
          );
        }

        const existingItem = rental.items.find(
          (i) =>
            i.itemId.toString() === itemUpdate.itemId &&
            (itemUpdate.unitId ? i.unitId === itemUpdate.unitId : !i.unitId),
        );

        if (existingItem) {
          if (itemUpdate.rentalType) {
            this.assertConfiguredRateForRentalType(
              inventoryItem,
              itemUpdate.rentalType,
            );
            existingItem.rentalType = itemUpdate.rentalType;
          }
          if (itemUpdate.pickupScheduled) {
            existingItem.pickupScheduled = new Date(itemUpdate.pickupScheduled);
          }
          if (
            itemUpdate.recalculateScheduledReturn &&
            existingItem.pickupScheduled
          ) {
            existingItem.returnScheduled = this.getPricingEndDate(
              new Date(existingItem.pickupScheduled),
              existingItem.rentalType,
            );
          } else if (itemUpdate.returnScheduled !== undefined) {
            existingItem.returnScheduled = itemUpdate.returnScheduled
              ? new Date(itemUpdate.returnScheduled)
              : undefined;
          }
          const syncRetro =
            itemUpdate.historicalDelivery !== undefined ||
            itemUpdate.returnScheduled !== undefined ||
            itemUpdate.recalculateScheduledReturn === true;
          if (syncRetro) {
            this.finalizeRetroactiveFlagsForItem(
              existingItem,
              itemUpdate.historicalDelivery,
              new Date(),
            );
          }
        } else {
          const quantity = itemUpdate.quantity || 1;
          if (!isUnit) {
            const available = inventoryItem.quantity.available || 0;
            if (available < quantity) {
              throw new Error(
                `Insufficient quantity for item ${inventoryItem.name}. Available: ${available}, Requested: ${quantity}`,
              );
            }
          } else {
            const unit = inventoryItem.units?.find(
              (u) => u.unitId === itemUpdate.unitId,
            );
            if (!unit || unit.status !== "available") {
              throw new Error(
                `Unit ${itemUpdate.unitId} is not available for rental`,
              );
            }
          }

          const rentalType: RentalType = itemUpdate.rentalType || "daily";
          this.assertConfiguredRateForRentalType(inventoryItem, rentalType);
          const pickupScheduled = itemUpdate.pickupScheduled
            ? new Date(itemUpdate.pickupScheduled)
            : rental.dates.pickupScheduled;
          let returnScheduled: Date | undefined = itemUpdate.returnScheduled
            ? new Date(itemUpdate.returnScheduled)
            : undefined;
          if (itemUpdate.recalculateScheduledReturn && pickupScheduled) {
            returnScheduled = this.getPricingEndDate(pickupScheduled, rentalType);
          }
          const pricingEndDate =
            returnScheduled ||
            this.getPricingEndDate(pickupScheduled, rentalType);

          const todayNew = this.normalizeDate(new Date());
          const retNorm = this.normalizeDate(pricingEndDate);
          let returnActual: Date | undefined;
          let retroactiveOpenBilling = false;
          if (retNorm.getTime() < todayNew.getTime()) {
            if (itemUpdate.historicalDelivery === true) {
              returnActual = retNorm;
            } else {
              retroactiveOpenBilling = true;
            }
          }

          const price = this.calculateRentalPrice(
            inventoryItem.pricing.dailyRate,
            inventoryItem.pricing.weeklyRate,
            inventoryItem.pricing.biweeklyRate,
            inventoryItem.pricing.monthlyRate,
            pickupScheduled,
            pricingEndDate,
            rentalType,
          );

          rental.items.push({
            itemId: itemUpdate.itemId,
            unitId: itemUpdate.unitId,
            quantity,
            unitPrice: price,
            rentalType,
            pickupScheduled,
            returnScheduled,
            returnActual,
            retroactiveOpenBilling,
            subtotal: price * quantity,
          } as any);

          const action =
            rental.status === "active" || rental.status === "overdue"
              ? "activate"
              : "reserve";
          await this.updateItemQuantityForRental(
            companyId,
            itemUpdate.itemId,
            quantity,
            action,
            userId,
            rental._id,
            itemUpdate.unitId,
            rental.customerId.toString(),
          );
        }

        changedItems.push({
          itemId: itemUpdate.itemId,
          unitId: itemUpdate.unitId,
        });
      }

      for (const changed of changedItems) {
        const item = rental.items.find(
          (i) =>
            i.itemId.toString() === changed.itemId &&
            (changed.unitId ? i.unitId === changed.unitId : !i.unitId),
        );
        if (item) {
          item.lastBillingDate = undefined;
          item.nextBillingDate = undefined;
        }
        await this.removeObsoleteUnpaidItemBillings(
          companyId,
          rental._id,
          changed.itemId,
          changed.unitId,
        );
        const lockedEnd = await this.getLatestLockedItemBillingEnd(
          companyId,
          rental._id,
          changed.itemId,
          changed.unitId,
        );
        if (item && lockedEnd) {
          item.lastBillingDate = lockedEnd;
          const nextStart = this.addDays(lockedEnd, 1);
          item.nextBillingDate = this.getPeriodEnd(
            nextStart,
            item.rentalType || "daily",
          );
        }
      }

      await this.recalcPricingForRental(rental, companyId);

      const pickups = rental.items
        .map((i) => i.pickupScheduled)
        .filter(Boolean) as Date[];
      if (pickups.length > 0) {
        rental.dates.pickupScheduled = new Date(
          Math.min(...pickups.map((d) => d.getTime())),
        );
      }
      const returns = rental.items
        .map((i) => i.returnScheduled)
        .filter(Boolean) as Date[];
      if (returns.length > 0) {
        rental.dates.returnScheduled = new Date(
          Math.max(...returns.map((d) => d.getTime())),
        );
      }
    }

    const shouldSyncBillings =
      (hasDateChanges || hasItemChanges) &&
      ["reserved", "active", "overdue", "ready_to_close"].includes(
        rental.status,
      );

    await this.addChangeHistory(
      rental,
      "rental_update",
      JSON.stringify({ ...changes, ...dateChanges, items: itemChanges }),
      JSON.stringify({ ...changes, ...dateChanges, items: itemChanges }),
      userId,
    );

    await rental.save();

    if (shouldSyncBillings) {
      await this.syncBillingsAfterRentalChange(companyId, rentalId, userId);
    }

    const finalRental =
      (await Rental.findOne({ _id: rentalId, companyId })) || rental;

    return { rental: finalRental, requiresApproval: false };
  }

  /**
   * Check and update overdue rentals
   */
  async checkOverdueRentals(companyId: string): Promise<number> {
    const now = new Date();
    const overdueRentals = await Rental.updateMany(
      {
        companyId,
        status: { $in: ["active", "reserved"] },
        "dates.returnScheduled": { $lt: now },
      },
      {
        $set: { status: "overdue" },
      },
    );

    return overdueRentals.modifiedCount;
  }

  /**
   * NOVO: Obter dashboard de vencimentos
   */
  async getExpirationDashboard(companyId: string): Promise<{
    expired: IRental[];
    expiringSoon: IRental[];
    expiringToday: IRental[];
    active: number;
    summary: {
      totalExpired: number;
      totalExpiringSoon: number;
      totalExpiringToday: number;
      totalActive: number;
    };
  }> {
    const now = new Date();

    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const sevenDaysFromNow = new Date(todayEnd);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    //Contratos vencidos
    const expiredQuery = {
      companyId,
      status: { $in: ["active", "reserved"] },
      "dates.returnScheduled": {
        $exists: true,
        $lt: todayStart,
      },
    };

    //Vencem hoje
    const expiringTodayQuery = {
      companyId,
      status: { $in: ["active", "reserved"] },
      "dates.returnScheduled": {
        $exists: true,
        $gte: todayStart,
        $lt: todayEnd,
      },
    };

    //Vencem em até 7 dias
    const expiringSoonQuery = {
      companyId,
      status: { $in: ["active", "reserved"] },
      "dates.returnScheduled": {
        $exists: true,
        $gt: todayEnd,
        $lte: sevenDaysFromNow,
      },
    };

    //Ativos
    const activeQuery = {
      companyId,
      status: "active",
    };

    const [expired, expiringSoon, expiringToday, activeCount] =
      await Promise.all([
        Rental.find(expiredQuery)
          .populate("customerId", "name cpfCnpj email phone")
          .populate("items.itemId", "name sku")
          .populate("workAddress")
          .sort({ "dates.returnScheduled": 1 })
          .limit(50),

        Rental.find(expiringSoonQuery)
          .populate("customerId", "name cpfCnpj email phone")
          .populate("items.itemId", "name sku")
          .populate("workAddress")
          .sort({ "dates.returnScheduled": 1 })
          .limit(50),

        Rental.find(expiringTodayQuery)
          .populate("customerId", "name cpfCnpj email phone")
          .populate("items.itemId", "name sku")
          .populate("workAddress")
          .sort({ "dates.returnScheduled": 1 }),

        Rental.countDocuments(activeQuery),
      ]);

    return {
      expired,
      expiringSoon,
      expiringToday,
      active: activeCount,
      summary: {
        totalExpired: expired.length,
        totalExpiringSoon: expiringSoon.length,
        totalExpiringToday: expiringToday.length,
        totalActive: activeCount,
      },
    };
  }

  private async updateItemQuantityForRental(
    companyId: string,
    itemId: mongoose.Types.ObjectId,
    quantity: number,
    action: "reserve" | "activate" | "return" | "cancel",
    userId: string,
    rentalId: mongoose.Types.ObjectId,
    unitId?: string,
    customerId?: string,
  ): Promise<void> {
    const item = await Item.findOne({ _id: itemId, companyId });

    if (!item) {
      throw new Error("Item not found");
    }

    // =========================
    // ITEM UNITÁRIO
    // =========================
    if (item.trackingType === "unit") {
      if (!unitId) {
        console.warn("[AVISO] Ação de unidade sem unitId", { itemId, rentalId });
        return;
      }

      const unit = item.units?.find((u) => u.unitId === unitId);
      if (!unit) {
        throw new Error("Unidade não encontrada");
      }

      switch (action) {
        case "reserve":
          if (unit.status === "reserved") return; // idempotente

          if (unit.status !== "available") {
            throw new Error(`Unidade ${unit.unitId} não está disponível`);
          }

          unit.status = "reserved";
          unit.currentRental = rentalId;
          unit.currentCustomer = customerId
            ? new mongoose.Types.ObjectId(customerId)
            : undefined;
          break;

        case "activate":
          if (unit.status === "rented") return; // idempotente

          if (unit.status !== "reserved") {
            throw new Error(`Unidade ${unit.unitId} não está reservada`);
          }

          unit.status = "rented";
          break;

        case "return":
          //proteção forte
          if (unit.status === "available") return;

          if (unit.status === "reserved") {
            console.warn(
              `Tentativa de devolução em unidade ainda reservada: ${unit.unitId}`,
            );
            return;
          }

          if (unit.status !== "rented") {
            throw new Error(`Unidade ${unit.unitId} não está alugada`);
          }

          unit.status = "available";
          unit.currentRental = undefined;
          unit.currentCustomer = undefined;
          break;

        case "cancel":
          if (unit.status === "available") return;

          if (unit.status !== "reserved") {
            console.warn(
              `Cancelamento ignorado - unidade não está reservada: ${unit.unitId}`,
            );
            return;
          }

          unit.status = "available";
          unit.currentRental = undefined;
          unit.currentCustomer = undefined;
          break;
      }

      // =========================
      // RECÁLCULO BASEADO NAS UNITS (FONTE DA VERDADE)
      // =========================
      const units = item.units ?? [];

      item.quantity.total = units.length;
      item.quantity.available = units.filter(
        (u) => u.status === "available",
      ).length;
      item.quantity.reserved = units.filter(
        (u) => u.status === "reserved",
      ).length;
      item.quantity.rented = units.filter((u) => u.status === "rented").length;
      item.quantity.maintenance = units.filter(
        (u) => u.status === "maintenance",
      ).length;
      item.quantity.damaged = units.filter(
        (u) => u.status === "damaged",
      ).length;

      await item.save();

      await ItemMovement.create({
        companyId: new mongoose.Types.ObjectId(companyId),
        itemId,
        type: action === "return" ? "return" : "rent",
        quantity: 1,
        referenceId: rentalId,
        notes: `Unit ${unit.unitId} ${action}`,
        createdBy: new mongoose.Types.ObjectId(userId),
      });

      return;
    }

    // =========================
    // ITEM QUANTITATIVO
    // =========================
    item.quantity.reserved = Number(item.quantity.reserved || 0);
    const previousQuantity = { ...item.quantity };

    switch (action) {
      case "reserve":
        item.quantity.available -= quantity;
        item.quantity.reserved += quantity;
        break;

      case "activate":
        item.quantity.reserved -= quantity;
        item.quantity.rented += quantity;
        break;

      case "return":
        item.quantity.rented -= quantity;
        item.quantity.available += quantity;
        break;

      case "cancel":
        item.quantity.reserved -= quantity;
        item.quantity.available += quantity;
        break;
    }

    if (
      item.quantity.available < 0 ||
      item.quantity.rented < 0 ||
      item.quantity.reserved < 0
    ) {
      console.error("[ERRO] Quantidade negativa após operação:", {
        itemName: item.name,
        itemId: item._id,
        acao: action,
        quantidadeSolicitada: quantity,
        quantidadeAnterior: previousQuantity,
        quantidadeAtual: item.quantity,
        rentalId,
      });

      throw new Error(
        `Operação inválida de quantidade para "${item.name}": Após ${action} de ${quantity} unidades, a quantidade dis${action === "return" ? "ponível" : "reservada"} ficaria negativa. ${action === "return" ? "Isto pode indicar que o item já foi devolvido ou há inconsistência nos dados." : "Verifique a disponibilidade do item."}. Por favor, contate o administrador.`
      );
    }

    await item.save();

    await ItemMovement.create({
      companyId: new mongoose.Types.ObjectId(companyId),
      itemId,
      type: action === "return" ? "return" : "rent",
      quantity,
      previousQuantity,
      newQuantity: item.quantity,
      referenceId: rentalId,
      notes: `Rental ${action}: ${quantity} units`,
      createdBy: new mongoose.Types.ObjectId(userId),
    });
  }
  /**
   * NOVO: Solicitar aprovação para alteração no aluguel
   */
  async requestApproval(
    companyId: string,
    rentalId: string,
    requestType: string,
    requestDetails: any,
    userId: string,
    notes?: string,
  ): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw new Error("Rental not found");
    }

    if (!rental.pendingApprovals) {
      rental.pendingApprovals = [];
    }

    const approval: IRentalPendingApproval = {
      requestedBy: new mongoose.Types.ObjectId(userId),
      requestDate: new Date(),
      requestType,
      requestDetails,
      status: "pending",
      notes,
    };

    rental.pendingApprovals.push(approval);
    await rental.save();

    return rental;
  }

  /**
   * NOVO: Aprovar solicitação pendente
   */
  async approveRequest(
    companyId: string,
    rentalId: string,
    approvalId: string,
    userId: string,
    notes?: string,
  ): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw new Error("Rental not found");
    }

    if (!rental.pendingApprovals || rental.pendingApprovals.length === 0) {
      throw new Error("Approval request not found");
    }

    const approval = rental.pendingApprovals.find(
      (item) => item._id?.toString() === approvalId,
    );
    if (!approval) {
      throw new Error("Approval request not found");
    }

    if (approval.status !== "pending") {
      throw new Error("Approval request is not pending");
    }

    // Aplicar a alteração baseada no tipo de solicitação
    await this.applyApprovalChange(rental, approval, userId);

    // Atualizar status da aprovação
    approval.status = "approved";
    approval.approvedBy = new mongoose.Types.ObjectId(userId);
    approval.approvalDate = new Date();
    approval.notes = notes;

    // Registrar no histórico
    await this.addChangeHistory(
      rental,
      approval.requestType,
      approval.requestDetails.previousValue || "",
      approval.requestDetails.newValue || "",
      userId,
      notes,
    );

    await rental.save();
    return rental;
  }

  /**
   * NOVO: Rejeitar solicitação pendente
   */
  async rejectRequest(
    companyId: string,
    rentalId: string,
    approvalId: string,
    userId: string,
    notes: string,
  ): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw new Error("Rental not found");
    }

    if (!rental.pendingApprovals || rental.pendingApprovals.length === 0) {
      throw new Error("Approval request not found");
    }

    const approval = rental.pendingApprovals.find(
      (item) => item._id?.toString() === approvalId,
    );
    if (!approval) {
      throw new Error("Approval request not found");
    }

    if (approval.status !== "pending") {
      throw new Error("Approval request is not pending");
    }

    approval.status = "rejected";
    approval.approvedBy = new mongoose.Types.ObjectId(userId);
    approval.approvalDate = new Date();
    approval.notes = notes;

    await rental.save();
    return rental;
  }

  /**
   * NOVO: Aplicar alteração aprovada
   */
  private async applyApprovalChange(
    rental: IRental,
    approval: IRentalPendingApproval,
    userId: string,
  ): Promise<void> {
    const { requestType, requestDetails } = approval;

    switch (requestType) {
      case "rental_type_change":
        // Alterar tipo de aluguel dos itens
        if (requestDetails.items && Array.isArray(requestDetails.items)) {
          for (const itemChange of requestDetails.items) {
            const item = rental.items.find(
              (i) => i.itemId.toString() === itemChange.itemId,
            );
            if (item) {
              item.rentalType = itemChange.newRentalType;
              item.lastBillingDate = undefined;
              item.nextBillingDate = undefined;
              await this.removeObsoleteUnpaidItemBillings(
                rental.companyId.toString(),
                rental._id,
                item.itemId,
                item.unitId,
              );
              const lockedEnd = await this.getLatestLockedItemBillingEnd(
                rental.companyId.toString(),
                rental._id,
                item.itemId,
                item.unitId,
              );
              if (lockedEnd) {
                item.lastBillingDate = lockedEnd;
                const nextStart = this.addDays(lockedEnd, 1);
                item.nextBillingDate = this.getPeriodEnd(
                  nextStart,
                  item.rentalType || "daily",
                );
              }
            }
          }
          await this.recalcPricingForRental(
            rental,
            rental.companyId.toString(),
          );
        }
        if (requestDetails.itemIndex !== undefined || requestDetails.itemId) {
          const item =
            requestDetails.itemIndex !== undefined
              ? rental.items[requestDetails.itemIndex]
              : rental.items.find(
                  (i) => i.itemId.toString() === requestDetails.itemId,
                );
          if (item && requestDetails.newRentalType) {
            item.rentalType = requestDetails.newRentalType;
            item.lastBillingDate = undefined;
            item.nextBillingDate = undefined;
            await this.removeObsoleteUnpaidItemBillings(
              rental.companyId.toString(),
              rental._id,
              item.itemId,
              item.unitId,
            );
            const lockedEnd = await this.getLatestLockedItemBillingEnd(
              rental.companyId.toString(),
              rental._id,
              item.itemId,
              item.unitId,
            );
            if (lockedEnd) {
              item.lastBillingDate = lockedEnd;
              const nextStart = this.addDays(lockedEnd, 1);
              item.nextBillingDate = this.getPeriodEnd(
                nextStart,
                item.rentalType || "daily",
              );
            }
            await this.recalcPricingForRental(
              rental,
              rental.companyId.toString(),
            );
          }
        }
        break;

      case "discount":
        // Aplicar desconto
        rental.pricing.discount = requestDetails.discount || 0;
        rental.pricing.discountReason = requestDetails.reason;
        rental.pricing.discountApprovedBy = new mongoose.Types.ObjectId(userId);
        rental.pricing.total = Math.max(
          0,
          rental.pricing.subtotal -
            rental.pricing.discount +
            rental.pricing.lateFee,
        );
        break;

      case "extension":
        // Estender período
        if (requestDetails.newReturnDate) {
          rental.dates.returnScheduled = new Date(requestDetails.newReturnDate);
          await this.recalcPricingForRental(
            rental,
            rental.companyId.toString(),
          );
        }
        break;

      case "service_addition":
        // Adicionar serviço
        if (!rental.services) {
          rental.services = [];
        }
        rental.services.push(requestDetails.service);
        rental.pricing.servicesSubtotal += requestDetails.service.subtotal;
        rental.pricing.subtotal =
          rental.pricing.equipmentSubtotal + rental.pricing.servicesSubtotal;
        rental.pricing.total = Math.max(
          0,
          rental.pricing.subtotal -
            rental.pricing.discount +
            rental.pricing.lateFee,
        );
        break;

      case "status_change":
        if (requestDetails.newStatus) {
          await this.applyStatusChangeDirect(
            rental,
            rental.status,
            requestDetails.newStatus,
            rental.companyId.toString(),
            userId,
          );
        }
        break;

      case "close_adjustment":
        if (requestDetails?.adjustments?.rentalType) {
          for (const item of rental.items) {
            item.rentalType = requestDetails.adjustments.rentalType;
          }
          rental.dates.billingCycle = requestDetails.adjustments.rentalType;
          await this.recalcPricingForRental(
            rental,
            rental.companyId.toString(),
          );
        }
        if (requestDetails.newStatus) {
          await this.applyStatusChangeDirect(
            rental,
            rental.status,
            requestDetails.newStatus,
            rental.companyId.toString(),
            userId,
            requestDetails.adjustments,
          );
        }
        break;

      case "rental_update":
        if (requestDetails.newNotes !== undefined) {
          rental.notes = requestDetails.newNotes;
        }
        if (requestDetails.newPickupScheduled) {
          rental.dates.pickupScheduled = new Date(
            requestDetails.newPickupScheduled,
          );
        }
        if (requestDetails.newReturnScheduled) {
          rental.dates.returnScheduled = new Date(
            requestDetails.newReturnScheduled,
          );
        }
        if (Array.isArray(requestDetails.items)) {
          const changedItems: Array<{ itemId: string; unitId?: string }> = [];
          for (const itemChange of requestDetails.items) {
            const inventoryItem = await Item.findOne({
              _id: itemChange.itemId,
              companyId: rental.companyId,
            });
            if (!inventoryItem) {
              throw new Error(`Item ${itemChange.itemId} not found`);
            }

            const isUnit = inventoryItem.trackingType === "unit";
            if (isUnit && !itemChange.unitId) {
              throw new Error(
                `Item ${inventoryItem.name} is unit-based. Please specify unitId.`,
              );
            }

            const existingItem = rental.items.find(
              (i) =>
                i.itemId.toString() === itemChange.itemId &&
                (itemChange.unitId
                  ? i.unitId === itemChange.unitId
                  : !i.unitId),
            );

            if (existingItem) {
              if (itemChange.newRentalType) {
                existingItem.rentalType = itemChange.newRentalType;
              }
              if (itemChange.newPickupScheduled) {
                existingItem.pickupScheduled = new Date(
                  itemChange.newPickupScheduled,
                );
              }
              if (itemChange.newReturnScheduled !== undefined) {
                existingItem.returnScheduled = itemChange.newReturnScheduled
                  ? new Date(itemChange.newReturnScheduled)
                  : undefined;
              }
            } else if (itemChange.isNew) {
              const quantity = itemChange.quantity || 1;
              if (!isUnit) {
                const available = inventoryItem.quantity.available || 0;
                if (available < quantity) {
                  throw new Error(
                    `Insufficient quantity for item ${inventoryItem.name}. Available: ${available}, Requested: ${quantity}`,
                  );
                }
              } else {
                const unit = inventoryItem.units?.find(
                  (u) => u.unitId === itemChange.unitId,
                );
                if (!unit || unit.status !== "available") {
                  throw new Error(
                    `Unit ${itemChange.unitId} is not available for rental`,
                  );
                }
              }

              const rentalType: RentalType =
                itemChange.newRentalType || "daily";
              const pickupScheduled = itemChange.newPickupScheduled
                ? new Date(itemChange.newPickupScheduled)
                : rental.dates.pickupScheduled;
              const returnScheduled = itemChange.newReturnScheduled
                ? new Date(itemChange.newReturnScheduled)
                : undefined;
              const pricingEndDate =
                returnScheduled ||
                this.getPricingEndDate(pickupScheduled, rentalType);

              const price = this.calculateRentalPrice(
                inventoryItem.pricing.dailyRate,
                inventoryItem.pricing.weeklyRate,
                inventoryItem.pricing.biweeklyRate,
                inventoryItem.pricing.monthlyRate,
                pickupScheduled,
                pricingEndDate,
                rentalType,
              );

              rental.items.push({
                itemId: itemChange.itemId,
                unitId: itemChange.unitId,
                quantity,
                unitPrice: price,
                rentalType,
                pickupScheduled,
                returnScheduled,
                subtotal: price * quantity,
              } as any);

              const action =
                rental.status === "active" || rental.status === "overdue"
                  ? "activate"
                  : "reserve";
              await this.updateItemQuantityForRental(
                rental.companyId.toString(),
                itemChange.itemId,
                quantity,
                action,
                userId,
                rental._id,
                itemChange.unitId,
                rental.customerId.toString(),
              );
            }

            changedItems.push({
              itemId: itemChange.itemId,
              unitId: itemChange.unitId,
            });
          }

          for (const changed of changedItems) {
            const item = rental.items.find(
              (i) =>
                i.itemId.toString() === changed.itemId &&
                (changed.unitId ? i.unitId === changed.unitId : !i.unitId),
            );
            if (item) {
              item.lastBillingDate = undefined;
              item.nextBillingDate = undefined;
            }
            await this.removeObsoleteUnpaidItemBillings(
              rental.companyId.toString(),
              rental._id,
              changed.itemId,
              changed.unitId,
            );
            const lockedEnd = await this.getLatestLockedItemBillingEnd(
              rental.companyId.toString(),
              rental._id,
              changed.itemId,
              changed.unitId,
            );
            if (item && lockedEnd) {
              item.lastBillingDate = lockedEnd;
              const nextStart = this.addDays(lockedEnd, 1);
              item.nextBillingDate = this.getPeriodEnd(
                nextStart,
                item.rentalType || "daily",
              );
            }
          }

          await this.recalcPricingForRental(
            rental,
            rental.companyId.toString(),
          );
        }
        break;

      default:
        // Outros tipos de alteração podem ser adicionados aqui
        break;
    }
  }

  /**
   * NOVO: Adicionar entrada no histórico de alterações
   */
  private async addChangeHistory(
    rental: IRental,
    changeType: string,
    previousValue: string,
    newValue: string,
    userId: string,
    reason?: string,
  ): Promise<void> {
    if (!rental.changeHistory) {
      rental.changeHistory = [];
    }

    const historyEntry: IRentalChangeHistory = {
      date: new Date(),
      changedBy: new mongoose.Types.ObjectId(userId),
      changeType,
      previousValue,
      newValue,
      reason,
      approvedBy: new mongoose.Types.ObjectId(userId),
    };

    rental.changeHistory.push(historyEntry);
  }

  /**
   * NOVO: Listar aprovações pendentes
   */
  async getPendingApprovals(companyId: string): Promise<IRental[]> {
    return Rental.find({
      companyId,
      "pendingApprovals.status": "pending",
    })
      .populate("customerId", "name cpfCnpj")
      .populate("pendingApprovals.requestedBy", "name email")
      .sort({ createdAt: -1 });
  }

  /**
   * NOVO: Aplicar desconto (com aprovação se necessário)
   */
  async applyDiscount(
    companyId: string,
    rentalId: string,
    discount: number,
    discountReason: string,
    userId: string,
    isAdmin: boolean = false,
  ): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw new Error("Rental not found");
    }

    const subtotal = rental.pricing.subtotal;
    const discountPercent = (discount / subtotal) * 100;

    // Se desconto > 10% ou não for admin, requer aprovação
    if (discountPercent > 10 && !isAdmin) {
      return this.requestApproval(
        companyId,
        rentalId,
        "discount",
        {
          discount,
          reason: discountReason,
          previousValue: rental.pricing.discount.toString(),
          newValue: discount.toString(),
        },
        userId,
        `Desconto de ${discountPercent.toFixed(2)}% solicitado`,
      );
    }

    // Aplicar desconto diretamente se admin ou <= 10%
    rental.pricing.discount = discount;
    rental.pricing.discountReason = discountReason;
    rental.pricing.discountApprovedBy = isAdmin
      ? new mongoose.Types.ObjectId(userId)
      : undefined;
    rental.pricing.total = Math.max(0, subtotal - discount + rental.pricing.lateFee);

    // Registrar no histórico
    await this.addChangeHistory(
      rental,
      "discount",
      rental.pricing.discount.toString(),
      discount.toString(),
      userId,
      discountReason,
    );

    await rental.save();
    return rental;
  }

  async changeRentalTypeFromEvent(
    companyId: string,
    rentalId: string,
    itemId: string,
    newRentalType: RentalType,
    userId: string,
    options?: {
      unitId?: string;
      effectiveDate?: Date;
      notes?: string;
    },
  ): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });
    if (!rental) {
      throw new Error("Rental not found");
    }

    const item = this.findOpenRentalItem(rental.items, itemId, options?.unitId);
    if (!item) {
      throw new Error("Item not found in rental");
    }

    const previousRentalType = item.rentalType || "daily";
    if (previousRentalType === newRentalType) {
      return rental;
    }

    const inventoryItem = await Item.findOne({
      _id: item.itemId,
      companyId,
    });
    if (!inventoryItem) {
      throw new Error("Item not found");
    }
    this.assertConfiguredRateForRentalType(inventoryItem, newRentalType);

    const effectiveNorm = options?.effectiveDate
      ? this.normalizeDate(options.effectiveDate)
      : this.normalizeDate(new Date());

    const periodStartForClose = item.lastBillingDate
      ? this.addDays(this.normalizeDate(new Date(item.lastBillingDate)), 1)
      : this.normalizeDate(
          new Date(item.pickupScheduled || rental.dates.pickupScheduled),
        );

    if (effectiveNorm.getTime() > periodStartForClose.getTime()) {
      await billingService.createPeriodicBillingForItem(
        companyId,
        rental,
        item,
        periodStartForClose,
        effectiveNorm,
        userId,
        {
          includeServices: false,
          notes: options?.notes || "Fechamento por mudança de tipo",
          status: "approved",
        },
      );
      item.lastBillingDate = effectiveNorm;
    }

    item.rentalType = newRentalType;
    const anchor = item.lastBillingDate
      ? this.normalizeDate(new Date(item.lastBillingDate))
      : periodStartForClose;
    item.nextBillingDate = this.getPeriodEnd(
      this.addDays(anchor, 1),
      newRentalType,
    );

    await this.addChangeHistory(
      rental,
      "rental_type_change",
      previousRentalType,
      newRentalType,
      userId,
      options?.notes || "Alteração de tipo no evento",
    );

    await rental.save();
    await this.syncBillingsAfterRentalChange(companyId, rentalId, userId);
    return Rental.findOne({ _id: rentalId, companyId });
  }

  // compatibilidade com endpoint legado baseado em índice
  async changeRentalType(
    companyId: string,
    rentalId: string,
    itemIndex: number,
    newRentalType: RentalType,
    userId: string,
  ): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });
    if (!rental) {
      throw new Error("Rental not found");
    }
    if (itemIndex < 0 || itemIndex >= rental.items.length) {
      throw new Error("Item index out of range");
    }

    const item = rental.items[itemIndex];
    return this.changeRentalTypeFromEvent(
      companyId,
      rentalId,
      item.itemId.toString(),
      newRentalType,
      userId,
      { unitId: item.unitId },
    );
  }
}

export const rentalService = new RentalService();
