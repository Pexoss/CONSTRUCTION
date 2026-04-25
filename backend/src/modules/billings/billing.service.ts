import { Billing } from './billing.model';
import { Rental } from '../rentals/rental.model';
import { Item } from '../inventory/item.model';
import { IBilling, IBillingCalculation, RentalType, BillingStatus } from './billing.types';
import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import { financialService } from '../financial/financial.service';
import { transactionService } from '../transactions/transaction.service';
import { Charge } from '../charges/charge.model';

/**
 * Calcula os períodos de aluguel baseado nas datas
 * @param pickupDate Data de retirada
 * @param returnDate Data de devolução
 * @param rentalType Tipo de aluguel (daily, weekly, biweekly, monthly)
 * @returns Objeto com períodos completos, dias extras e se deve cobrar período extra
 */
export function calculateBillingPeriod(
  pickupDate: Date,
  returnDate: Date,
  rentalType: RentalType
): {
  periodsCompleted: number;
  extraDays: number;
  totalPeriods: number;
  chargeExtraPeriod: boolean;
} {
  const periodDays: Record<RentalType, number> = {
    daily: 1,
    weekly: 7,
    biweekly: 15,
    monthly: 30,
  };

  const periodLength = periodDays[rentalType];
  const diffDays = Math.ceil(
    (returnDate.getTime() - pickupDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  const daysPassed = Math.max(1, diffDays);
  const periodsCompleted = Math.floor(daysPassed / periodLength);
  const extraDays = daysPassed % periodLength;

  // Se tem dias extras, cobra mais um período completo
  const chargeExtraPeriod = extraDays > 0;
  const totalPeriods = chargeExtraPeriod ? periodsCompleted + 1 : periodsCompleted;

  return {
    periodsCompleted,
    extraDays,
    totalPeriods,
    chargeExtraPeriod,
  };
}

function getPeriodLengthDays(rentalType: RentalType): number {
  const periodDays: Record<RentalType, number> = {
    daily: 1,
    weekly: 7,
    biweekly: 15,
    monthly: 30,
  };

  return periodDays[rentalType];
}

function addPeriod(date: Date, rentalType: RentalType): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + getPeriodLengthDays(rentalType));
  return next;
}

function normalizeDateKey(value?: Date | string): string {
  if (!value) return "na";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "na";
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function asIdString(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value?._id) {
    const nested = value._id;
    if (typeof nested === "string") return nested;
    if (nested?.toString) return nested.toString();
  }
  if (value?.toString) return value.toString();
  return String(value);
}

function buildRentalLineKey(item: any): string {
  const itemId = asIdString(item?.itemId) || "na";
  const unitId = item?.unitId ? String(item.unitId) : "no-unit";
  const rentalType = String(item?.rentalType || "daily");
  const pickup = normalizeDateKey(item?.pickupScheduled);
  const ret = normalizeDateKey(item?.returnScheduled);
  return [itemId, unitId, rentalType, pickup, ret].join("|");
}

/**
 * Valor unitário de cobrança por período conforme o tipo (diária = valor/dia, semanal = valor/semana, etc.).
 * Se a taxa do tipo não existir, deriva da diária (×7, ×15 ou ×30) e retorna mensagem para log/aviso.
 */
export function periodRateFromInventory(
  pricing: { dailyRate?: number; weeklyRate?: number; biweeklyRate?: number; monthlyRate?: number } | undefined,
  rentalType: RentalType
): { rate: number; message?: string } {
  const d = Math.max(0, Number(pricing?.dailyRate ?? 0));
  const w = Math.max(0, Number(pricing?.weeklyRate ?? 0));
  const b = Math.max(0, Number(pricing?.biweeklyRate ?? 0));
  const m = Math.max(0, Number(pricing?.monthlyRate ?? 0));

  switch (rentalType) {
    case 'daily':
      if (d > 0) return { rate: d };
      return { rate: 0, message: 'Cadastre a diária do equipamento.' };
    case 'weekly':
      if (w > 0) return { rate: w };
      if (d > 0) {
        return {
          rate: 7 * d,
          message: 'Taxa semanal não cadastrada; aplicada diária × 7 a partir do cadastro do equipamento.',
        };
      }
      return { rate: 0, message: 'Cadastre a semanal ou a diária do equipamento.' };
    case 'biweekly':
      if (b > 0) return { rate: b };
      if (d > 0) {
        return {
          rate: 15 * d,
          message: 'Taxa quinzenal não cadastrada; aplicada diária × 15 a partir do cadastro do equipamento.',
        };
      }
      return { rate: 0, message: 'Cadastre a quinzenal ou a diária do equipamento.' };
    case 'monthly':
      if (m > 0) return { rate: m };
      if (d > 0) {
        return {
          rate: 30 * d,
          message: 'Taxa mensal não cadastrada; aplicada diária × 30 a partir do cadastro do equipamento.',
        };
      }
      return { rate: 0, message: 'Cadastre a mensal ou a diária do equipamento.' };
    default:
      return d > 0 ? { rate: d } : { rate: 0, message: 'Cadastre a diária do equipamento.' };
  }
}

/** Evita E11000 quando vários fechamentos são criados em sequência (count+1 gerava o mesmo número). */
async function createBillingWithRetry(payload: Record<string, unknown>): Promise<IBilling> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 25; attempt++) {
    const data: Record<string, unknown> = { ...payload };
    delete data.billingNumber;
    try {
      const created = await Billing.create(data);
      return created;
    } catch (err: any) {
      lastErr = err;
      const dupBilling =
        err?.code === 11000 &&
        err?.keyPattern &&
        Object.prototype.hasOwnProperty.call(err.keyPattern, 'billingNumber');
      if (!dupBilling) {
        throw err;
      }
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error('Não foi possível gerar um número de fechamento único.');
}

class BillingService {
  private pickRentalItemsForBilling(rental: any, billing: any): any[] {
    const rentalItems = Array.isArray(rental?.items) ? rental.items : [];
    const billingItems = Array.isArray(billing?.items) ? billing.items : [];
    if (!rentalItems.length || !billingItems.length) return rentalItems;

    const usedIndices = new Set<number>();
    const selected: any[] = [];

    for (const billingItem of billingItems) {
      const billingItemId = asIdString(billingItem?.itemId);
      const billingUnitId = billingItem?.unitId ? String(billingItem.unitId) : undefined;
      const billingLineKey = billingItem?.rentalLineKey
        ? String(billingItem.rentalLineKey)
        : undefined;

      let matchIdx = -1;
      if (billingLineKey) {
        matchIdx = rentalItems.findIndex((ri: any, idx: number) => {
          if (usedIndices.has(idx)) return false;
          return buildRentalLineKey(ri) === billingLineKey;
        });
      }

      if (matchIdx === -1) {
        matchIdx = rentalItems.findIndex((ri: any, idx: number) => {
          if (usedIndices.has(idx)) return false;
          const riId = asIdString(ri?.itemId);
          if (riId !== billingItemId) return false;
          if (billingUnitId) return String(ri?.unitId || "") === billingUnitId;
          return true;
        });
      }

      if (matchIdx >= 0) {
        usedIndices.add(matchIdx);
        selected.push(rentalItems[matchIdx]);
      }
    }

    return selected.length ? selected : rentalItems;
  }

  private async buildScopedBillingItems(
    companyId: string,
    scopedRentalItems: any[],
    rentalType: RentalType,
    periodsCharged: number,
  ): Promise<{ items: any[]; equipmentSubtotal: number }> {
    let equipmentSubtotal = 0;
    const items: any[] = [];

    for (const item of scopedRentalItems) {
      let lineUnit = Number(item.unitPrice || 0);
      if (lineUnit <= 0) {
        const inv = await Item.findOne({ _id: item.itemId, companyId }).lean();
        if (!inv) {
          throw new Error(
            `Equipamento não encontrado. Não é possível definir valor do fechamento (item ${item.itemId}).`,
          );
        }
        const { rate, message } = periodRateFromInventory(inv.pricing, rentalType);
        if (rate <= 0) {
          throw new Error(
            message || `Cadastre no equipamento "${inv.name}" o valor da cobrança (${rentalType}) ou a diária.`,
          );
        }
        lineUnit = rate;
      }

      const subtotal = lineUnit * Number(item.quantity || 0) * periodsCharged;
      equipmentSubtotal += subtotal;
      items.push({
        itemId: item.itemId,
        unitId: item.unitId,
        rentalLineKey: buildRentalLineKey(item),
        quantity: item.quantity,
        unitPrice: Number(lineUnit.toFixed(2)),
        periodsCharged,
        subtotal: Number(subtotal.toFixed(2)),
      });
    }

    return { items, equipmentSubtotal: Number(equipmentSubtotal.toFixed(2)) };
  }

  private enforcePositiveBillingTotals(
    equipmentSubtotal: number,
    servicesSubtotal: number,
    total: number,
  ): void {
    const gross = equipmentSubtotal + servicesSubtotal;
    if (gross <= 0) {
      throw new Error(
        'O fechamento não pode ter valor zerado. Ajuste os valores no aluguel ou cadastre diária/semanal/quinzenal/mensal no equipamento.',
      );
    }
    if (total <= 0) {
      throw new Error(
        'O total do fechamento não pode ser zero. Reduza o desconto ou revise os valores no contrato.',
      );
    }
  }

  private async persistRentalLineUnitPrice(
    companyId: string,
    rentalId: mongoose.Types.ObjectId,
    lineItem: any,
    unitPrice: number,
  ): Promise<void> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });
    if (!rental) return;
    const lineItemId = asIdString(lineItem.itemId);
    const idx = rental.items.findIndex((ri: any) => {
      const id = asIdString(ri.itemId);
      if (id !== lineItemId) return false;
      if (lineItem.unitId) return ri.unitId === lineItem.unitId;
      return !ri.unitId;
    });
    if (idx === -1) return;
    if (Number(rental.items[idx].unitPrice) <= 0) {
      rental.items[idx].unitPrice = unitPrice;
      rental.markModified('items');
      await rental.save();
    }
  }

  /** Preenche unitPrice nas linhas do aluguel quando estiver zerado, a partir do cadastro do equipamento. */
  private async ensureRentalItemsHavePeriodRates(companyId: string, rental: any): Promise<string[]> {
    const warnings: string[] = [];
    let changed = false;
    for (let i = 0; i < (rental.items?.length || 0); i++) {
      const it = rental.items[i];
      if (Number(it.unitPrice) > 0) continue;
      const rt = (it.rentalType || 'daily') as RentalType;
      const inv = await Item.findOne({ _id: it.itemId, companyId }).lean();
      if (!inv) {
        throw new Error(
          `Equipamento não encontrado. Não é possível definir valor do fechamento (item ${it.itemId}).`,
        );
      }
      const { rate, message } = periodRateFromInventory(inv.pricing, rt);
      if (rate <= 0) {
        throw new Error(
          message || `Cadastre no equipamento "${inv.name}" o valor da cobrança (${rt}) ou a diária.`,
        );
      }
      rental.items[i].unitPrice = rate;
      changed = true;
      if (message) {
        console.warn('[Fechamento]', message);
        warnings.push(message);
      }
    }
    if (changed) {
      if (typeof rental.markModified === 'function') {
        rental.markModified('items');
        await rental.save();
      } else {
        await Rental.updateOne(
          { _id: rental._id, companyId },
          { $set: { items: rental.items } },
        );
      }
    }
    return warnings;
  }

  async previewBillingRefresh(companyId: string, billingId: string) {
    const billing = await Billing.findOne({ _id: billingId, companyId });
    if (!billing) throw new Error('Billing not found');
    if (billing.status === 'paid' || billing.status === 'cancelled') {
      throw new Error('Não é possível atualizar fechamento pago ou cancelado');
    }

    const rental = await Rental.findOne({ _id: billing.rentalId, companyId })
      .populate('items.itemId')
      .populate('customerId');
    if (!rental) throw new Error('Rental not found');

    const periodStart = new Date(billing.periodStart);
    const periodEnd = new Date(billing.periodEnd);
    const rentalType: RentalType = billing.rentalType || rental.dates?.billingCycle || rental.items[0]?.rentalType || 'daily';
    const periodCalculation = calculateBillingPeriod(periodStart, periodEnd, rentalType);
    const periodsCharged = Math.max(1, periodCalculation.totalPeriods);
    const scopedRentalItems = this.pickRentalItemsForBilling(rental, billing);
    const isScopedBilling = scopedRentalItems.length > 0 && scopedRentalItems.length < rental.items.length;
    const { equipmentSubtotal } = isScopedBilling
      ? await this.buildScopedBillingItems(
        companyId,
        scopedRentalItems,
        rentalType,
        periodsCharged,
      )
      : await this.buildBillingItems(
        companyId,
        rental,
        rentalType,
        periodsCharged,
      );
    const hadServices =
      (billing.services?.length ?? 0) > 0 ||
      Number(billing.calculation?.servicesAmount ?? 0) > 0;
    const { servicesSubtotal } = this.buildBillingServices(rental, hadServices);
    const subtotal = equipmentSubtotal + servicesSubtotal;
    const discount = billing.calculation?.discount || 0;
    const nextTotal = Math.max(0, subtotal - discount + (rental.pricing?.lateFee || 0));
    const currentTotal = Number(billing.calculation?.total || 0);
    const currentOutstanding = Number(billing.outstandingAmount ?? currentTotal);
    const paidAmount = Math.max(0, currentTotal - currentOutstanding);
    const nextOutstanding = Math.max(0, nextTotal - paidAmount);

    return {
      billingId: String(billing._id),
      billingNumber: billing.billingNumber,
      customerName: (rental.customerId as any)?.name || 'Cliente',
      current: {
        total: currentTotal,
        outstandingAmount: currentOutstanding,
      },
      next: {
        total: Number(nextTotal.toFixed(2)),
        outstandingAmount: Number(nextOutstanding.toFixed(2)),
      },
      diff: {
        total: Number((nextTotal - currentTotal).toFixed(2)),
        outstandingAmount: Number((nextOutstanding - currentOutstanding).toFixed(2)),
      },
    };
  }

  async refreshBillingFromRental(companyId: string, billingId: string): Promise<IBilling> {
    const billing = await Billing.findOne({ _id: billingId, companyId });
    if (!billing) throw new Error('Billing not found');
    if (billing.status === 'paid' || billing.status === 'cancelled') {
      throw new Error('Não é possível atualizar fechamento pago ou cancelado');
    }

    const rental = await Rental.findOne({ _id: billing.rentalId, companyId })
      .populate('items.itemId')
      .populate('customerId');
    if (!rental) throw new Error('Rental not found');

    const periodStart = new Date(billing.periodStart);
    const periodEnd = new Date(billing.periodEnd);
    const rentalType: RentalType = billing.rentalType || rental.dates?.billingCycle || rental.items[0]?.rentalType || 'daily';
    const periodCalculation = calculateBillingPeriod(periodStart, periodEnd, rentalType);
    const periodsCharged = Math.max(1, periodCalculation.totalPeriods);

    const scopedRentalItems = this.pickRentalItemsForBilling(rental, billing);
    const isScopedBilling = scopedRentalItems.length > 0 && scopedRentalItems.length < rental.items.length;
    const { items, equipmentSubtotal } = isScopedBilling
      ? await this.buildScopedBillingItems(
        companyId,
        scopedRentalItems,
        rentalType,
        periodsCharged,
      )
      : await this.buildBillingItems(
        companyId,
        rental,
        rentalType,
        periodsCharged,
      );
    const hadServices =
      (billing.services?.length ?? 0) > 0 ||
      Number(billing.calculation?.servicesAmount ?? 0) > 0;
    const { services, servicesSubtotal } = this.buildBillingServices(rental, hadServices);
    const subtotal = equipmentSubtotal + servicesSubtotal;
    const discount = billing.calculation?.discount || 0;
    const total = Math.max(0, subtotal - discount + (rental.pricing?.lateFee || 0));
    this.enforcePositiveBillingTotals(equipmentSubtotal, servicesSubtotal, total);

    const paidAmount = Math.max(0, (billing.calculation?.total || 0) - (billing.outstandingAmount ?? billing.calculation?.total ?? 0));

    billing.items = items as any;
    billing.services = services as any;
    billing.calculation = {
      baseRate: items[0]?.unitPrice || 0,
      periodsCompleted: periodCalculation.periodsCompleted,
      extraDays: periodCalculation.extraDays,
      chargeExtraPeriod: periodCalculation.chargeExtraPeriod,
      baseAmount: equipmentSubtotal,
      servicesAmount: servicesSubtotal,
      subtotal,
      discount,
      discountReason: billing.calculation?.discountReason,
      total,
    } as IBillingCalculation;
    billing.outstandingAmount = Math.max(0, total - paidAmount);
    billing.notes = `${billing.notes || ''}\nAtualizado com dados atuais do aluguel em ${new Date().toISOString()}`.trim();
    await billing.save();

    if (billing.chargeId) {
      const charge = await Charge.findOne({ _id: billing.chargeId, companyId });
      if (charge && charge.status !== 'paid' && charge.status !== 'cancelled') {
        const related = await Billing.find({ _id: { $in: charge.billingIds }, companyId });
        const totalCharge = related.reduce((acc, b) => acc + Number(b.outstandingAmount ?? b.calculation.total ?? 0), 0) + Number(charge.paidAmount || 0);
        charge.total = Number(totalCharge.toFixed(2));
        charge.outstandingAmount = Math.max(0, charge.total - charge.paidAmount);
        charge.status = charge.outstandingAmount === 0 ? 'paid' : charge.paidAmount > 0 ? 'partial' : 'pending';
        await charge.save();
      }
    }

    return billing;
  }

  async updateBilling(
    companyId: string,
    billingId: string,
    data: {
      periodStart?: Date;
      periodEnd?: Date;
      notes?: string;
      discount?: number;
      discountReason?: string;
    }
  ): Promise<IBilling> {
    const billing = await Billing.findOne({ _id: billingId, companyId });
    if (!billing) throw new Error("Billing not found");
    if (billing.status === "paid" || billing.status === "cancelled") {
      throw new Error("Não é possível editar fechamento pago ou cancelado");
    }

    if (data.periodStart) billing.periodStart = data.periodStart;
    if (data.periodEnd) billing.periodEnd = data.periodEnd;
    if (typeof data.notes === "string") billing.notes = data.notes;
    if (typeof data.discount === "number") {
      billing.calculation.discount = data.discount;
      billing.calculation.discountReason = data.discountReason;
      billing.calculation.total = Math.max(0, billing.calculation.subtotal - data.discount);
      billing.outstandingAmount = Math.min(
        billing.outstandingAmount ?? billing.calculation.total,
        billing.calculation.total
      );
    }

    await billing.save();
    return billing;
  }

  async cancelBilling(companyId: string, billingId: string): Promise<IBilling> {
    const billing = await Billing.findOne({ _id: billingId, companyId });
    if (!billing) throw new Error("Billing not found");
    if (billing.status === "paid") throw new Error("Não é possível cancelar fechamento pago");

    billing.status = "cancelled";
    billing.financialStage = "cancelled";
    billing.chargeId = undefined;
    billing.invoiceId = undefined;
    await billing.save();
    return billing;
  }

  private async buildBillingItems(
    companyId: string,
    rental: any,
    rentalType: RentalType,
    periodsCharged: number,
    targetEquipmentSubtotal?: number
  ): Promise<{ items: any[]; equipmentSubtotal: number }> {
    await this.ensureRentalItemsHavePeriodRates(companyId, rental);

    const periodLength = getPeriodLengthDays(rentalType);
    const contractedDays = rental.pricing?.contractedDays || periodLength;
    const contractedPeriods = Math.max(1, Math.ceil(contractedDays / periodLength));

    const baseEquipmentSubtotal =
      rental.pricing?.originalEquipmentSubtotal || rental.pricing?.equipmentSubtotal || 0;
    const scaleFactor =
      targetEquipmentSubtotal && baseEquipmentSubtotal > 0
        ? targetEquipmentSubtotal / baseEquipmentSubtotal
        : 1;

    let equipmentSubtotal = 0;
    const billingItems = rental.items.map((item: any) => {
      const unitPricePerPeriod = (item.unitPrice / contractedPeriods) * scaleFactor;
      const subtotal = unitPricePerPeriod * item.quantity * periodsCharged;
      equipmentSubtotal += subtotal;

      return {
        itemId: item.itemId,
        unitId: item.unitId,
        quantity: item.quantity,
        unitPrice: Number(unitPricePerPeriod.toFixed(2)),
        periodsCharged,
        subtotal: Number(subtotal.toFixed(2)),
      };
    });

    return { items: billingItems, equipmentSubtotal: Number(equipmentSubtotal.toFixed(2)) };
  }

  private buildBillingServices(rental: any, includeServices: boolean): { services: any[]; servicesSubtotal: number } {
    if (!includeServices) {
      return { services: [], servicesSubtotal: 0 };
    }

    let servicesSubtotal = 0;
    const billingServices = (rental.services || []).map((service: any) => {
      servicesSubtotal += service.subtotal;
      return {
        description: service.description,
        price: service.price,
        quantity: service.quantity,
        subtotal: service.subtotal,
      };
    });

    return { services: billingServices, servicesSubtotal };
  }

  async createPeriodicBilling(
    companyId: string,
    rentalId: string,
    periodStart: Date,
    periodEnd: Date,
    userId: string,
    options?: {
      includeServices?: boolean;
      notes?: string;
      targetEquipmentSubtotal?: number;
      totalOverride?: number;
      discount?: number;
      discountReason?: string;
      status?: BillingStatus;
    }
  ): Promise<IBilling> {
    const rental = await Rental.findOne({ _id: rentalId, companyId })
      .populate('items.itemId')
      .populate('customerId');

    if (!rental) {
      throw new Error('Rental not found');
    }

    const rentalType: RentalType =
      rental.dates.billingCycle || rental.items[0]?.rentalType || 'daily';

    const periodCalculation = calculateBillingPeriod(periodStart, periodEnd, rentalType);
    const periodsCharged = Math.max(1, periodCalculation.totalPeriods);

    const { items, equipmentSubtotal } = await this.buildBillingItems(
      companyId,
      rental,
      rentalType,
      periodsCharged,
      options?.targetEquipmentSubtotal
    );

    const { services, servicesSubtotal } = this.buildBillingServices(
      rental,
      !!options?.includeServices
    );

    const subtotal = equipmentSubtotal + servicesSubtotal;
    const appliedDiscount = options?.discount ?? 0;
    const total =
      options?.totalOverride !== undefined
        ? options.totalOverride
        : subtotal - appliedDiscount + (rental.pricing?.lateFee || 0);

    if (options?.totalOverride !== undefined) {
      if (Number(options.totalOverride) <= 0) {
        throw new Error('O total do fechamento não pode ser zero.');
      }
    } else {
      this.enforcePositiveBillingTotals(equipmentSubtotal, servicesSubtotal, total);
    }

    const calculation: IBillingCalculation = {
      baseRate: items[0]?.unitPrice || 0,
      periodsCompleted: periodCalculation.periodsCompleted,
      extraDays: periodCalculation.extraDays,
      chargeExtraPeriod: periodCalculation.chargeExtraPeriod,
      baseAmount: equipmentSubtotal,
      servicesAmount: servicesSubtotal,
      subtotal,
      discount: appliedDiscount,
      discountReason: options?.discountReason,
      total,
    };

    const billing = await createBillingWithRetry({
      companyId,
      rentalId,
      customerId: rental.customerId,
      billingDate: new Date(),
      periodStart,
      periodEnd,
      rentalType,
      calculation,
      items,
      services,
      status: options?.status || 'approved',
      financialStage: 'pending',
      governance: 'charge',
      outstandingAmount: total,
      approvalRequired: false,
      requestedBy: userId,
      notes: options?.notes,
    });

    return billing;
  }

  async createPeriodicBillingForItem(
    companyId: string,
    rental: any,
    item: any,
    periodStart: Date,
    periodEnd: Date,
    userId: string,
    options?: {
      includeServices?: boolean;
      notes?: string;
      discount?: number;
      discountReason?: string;
      status?: BillingStatus;
    }
  ): Promise<IBilling> {
    if (!rental) {
      throw new Error('Rental not found');
    }

    const rentalType: RentalType = item.rentalType || 'daily';
    const normalizedStart = new Date(periodStart);
    normalizedStart.setHours(0, 0, 0, 0);
    const normalizedEnd = new Date(periodEnd);
    normalizedEnd.setHours(0, 0, 0, 0);

    const periodCalculation = calculateBillingPeriod(normalizedStart, normalizedEnd, rentalType);
    const periodsCharged = Math.max(1, periodCalculation.totalPeriods);

    let lineUnit = Number(item.unitPrice);
    const autoNotes: string[] = [];
    if (lineUnit <= 0) {
      const inv = await Item.findOne({ _id: item.itemId, companyId }).lean();
      if (!inv) {
        throw new Error(
          `Equipamento não encontrado. Não é possível definir valor do fechamento (item ${item.itemId}).`,
        );
      }
      const { rate, message } = periodRateFromInventory(inv.pricing, rentalType);
      if (rate <= 0) {
        throw new Error(
          message || `Cadastre no equipamento "${inv.name}" o valor da cobrança (${rentalType}) ou a diária.`,
        );
      }
      lineUnit = rate;
      if (message) {
        console.warn('[Fechamento]', message);
        autoNotes.push(message);
      }
      await this.persistRentalLineUnitPrice(companyId, rental._id, item, lineUnit);
    }

    const itemSubtotal = lineUnit * item.quantity * periodsCharged;
    const rentalLineKey = buildRentalLineKey(item);
    const items = [
      {
        itemId: item.itemId,
        unitId: item.unitId,
        rentalLineKey,
        quantity: item.quantity,
        unitPrice: lineUnit,
        periodsCharged,
        subtotal: Number(itemSubtotal.toFixed(2)),
      },
    ];

    const { services, servicesSubtotal } = this.buildBillingServices(
      rental,
      !!options?.includeServices
    );

    const equipmentSubtotal = Number(itemSubtotal.toFixed(2));
    const subtotal = equipmentSubtotal + servicesSubtotal;
    const appliedDiscount = options?.discount ?? 0;
    const total = subtotal - appliedDiscount + (rental.pricing?.lateFee || 0);

    this.enforcePositiveBillingTotals(equipmentSubtotal, servicesSubtotal, total);

    const calculation: IBillingCalculation = {
      baseRate: lineUnit || 0,
      periodsCompleted: periodCalculation.periodsCompleted,
      extraDays: periodCalculation.extraDays,
      chargeExtraPeriod: periodCalculation.chargeExtraPeriod,
      baseAmount: equipmentSubtotal,
      servicesAmount: servicesSubtotal,
      subtotal,
      discount: appliedDiscount,
      discountReason: options?.discountReason,
      total,
    };

    const notesCombined = [options?.notes, autoNotes.length ? `[Aviso] ${autoNotes.join(' ')}` : '']
      .filter(Boolean)
      .join('\n');

    const targetStatus = options?.status || 'approved';
    const itemScopedFilter: Record<string, unknown> = {
      companyId,
      rentalId: rental._id,
      rentalType,
      periodStart: normalizedStart,
      periodEnd: normalizedEnd,
      status: targetStatus,
      financialStage: { $nin: ['paid', 'cancelled'] },
      'items.itemId': item.itemId,
    };
    if (item.unitId) {
      itemScopedFilter['items.unitId'] = item.unitId;
    }
    if (rentalLineKey) {
      itemScopedFilter['items.rentalLineKey'] = rentalLineKey;
    }

    // Regra: 1 fechamento por item/tipo/período.
    const existing = await Billing.findOne(itemScopedFilter);
    if (existing) {
      return existing as IBilling;
    }

    const billing = await createBillingWithRetry({
      companyId,
      rentalId: rental._id,
      customerId: rental.customerId,
      billingDate: new Date(),
      periodStart: normalizedStart,
      periodEnd: normalizedEnd,
      rentalType,
      calculation,
      items,
      services,
      status: targetStatus,
      financialStage: 'pending',
      governance: 'charge',
      outstandingAmount: total,
      approvalRequired: false,
      requestedBy: userId,
      notes: notesCombined || undefined,
    });

    return billing;
  }

  /**
   * Cria um fechamento de aluguel
   */
  async createBilling(
    companyId: string,
    rentalId: string,
    returnDate: Date,
    userId: string,
    discount?: number,
    discountReason?: string
  ): Promise<IBilling> {
    // Buscar o aluguel
    const rental = await Rental.findOne({
      _id: rentalId,
      companyId,
    })
      .populate('items.itemId')
      .populate('customerId');

    if (!rental) {
      throw new Error('Rental not found');
    }

    if (rental.status === 'completed' || rental.status === 'cancelled') {
      throw new Error('Rental is already completed or cancelled');
    }

    await this.ensureRentalItemsHavePeriodRates(companyId, rental);

    let includeServicesAvailable =
      (await Billing.countDocuments({
        companyId,
        rentalId,
      })) === 0;

    const createdBillings: IBilling[] = [];
    const normalizedReturnDate = new Date(returnDate);
    normalizedReturnDate.setHours(0, 0, 0, 0);

    for (const item of rental.items) {
      const periodStart = item.lastBillingDate
        ? new Date(new Date(item.lastBillingDate).setDate(new Date(item.lastBillingDate).getDate() + 1))
        : new Date(item.pickupScheduled || rental.dates.pickupActual || rental.dates.pickupScheduled);
      periodStart.setHours(0, 0, 0, 0);

      if (normalizedReturnDate <= periodStart) {
        continue;
      }

      const rentalType: RentalType = item.rentalType || "daily";
      const rentalLineKey = buildRentalLineKey(item);
      const existingFilter: Record<string, unknown> = {
        companyId,
        rentalId: rental._id,
        rentalType,
        periodStart,
        periodEnd: normalizedReturnDate,
        "items.itemId": item.itemId,
        "items.rentalLineKey": rentalLineKey,
      };
      if (item.unitId) {
        existingFilter["items.unitId"] = item.unitId;
      }

      const existing = await Billing.findOne(existingFilter).lean();
      if (existing) {
        continue;
      }

      const billing = await this.createPeriodicBillingForItem(
        companyId,
        rental,
        item,
        periodStart,
        normalizedReturnDate,
        userId,
        {
          includeServices: includeServicesAvailable,
          notes: rental.notes,
          discount: createdBillings.length === 0 ? discount : 0,
          discountReason: createdBillings.length === 0 ? discountReason : undefined,
          status: "approved",
        },
      );

      createdBillings.push(billing);
      includeServicesAvailable = false;
    }

    if (createdBillings.length === 0) {
      throw new Error(
        "Nenhum fechamento foi criado. Verifique se os períodos dos itens já foram faturados.",
      );
    }

    return createdBillings[0];
  }

  /**
   * Aprova um fechamento pendente
   */
  async approveBilling(
    companyId: string,
    billingId: string,
    userId: string,
    notes?: string
  ): Promise<IBilling> {
    const billing = await Billing.findOne({
      _id: billingId,
      companyId,
    });

    if (!billing) {
      throw new Error('Billing not found');
    }

    if (billing.status !== 'pending_approval') {
      throw new Error('Billing is not pending approval');
    }

    billing.status = 'approved';
    billing.approvedBy = new mongoose.Types.ObjectId(userId);
    billing.approvalDate = new Date();
    billing.approvalNotes = notes;

    await billing.save();

    return billing;
  }

  /**
   * Rejeita um fechamento pendente
   */
  async rejectBilling(
    companyId: string,
    billingId: string,
    userId: string,
    notes: string
  ): Promise<IBilling> {
    const billing = await Billing.findOne({
      _id: billingId,
      companyId,
    });

    if (!billing) {
      throw new Error('Billing not found');
    }

    if (billing.status !== 'pending_approval') {
      throw new Error('Billing is not pending approval');
    }

    billing.status = 'cancelled';
    billing.approvedBy = new mongoose.Types.ObjectId(userId);
    billing.approvalDate = new Date();
    billing.approvalNotes = notes;

    await billing.save();

    return billing;
  }

  /**
   * Marca fechamento como pago
   */
  async markAsPaid(
    companyId: string,
    billingId: string,
    paymentMethod: string,
    paymentDate?: Date,
    amount?: number,
    discount?: number,
    discountReason?: string
  ): Promise<IBilling> {
    const billing = await Billing.findOne({
      _id: billingId,
      companyId,
    });

    if (!billing) {
      throw new Error('Billing not found');
    }

    if (billing.status !== 'approved') {
      throw new Error('Billing must be approved before marking as paid');
    }

    const paidAt = paymentDate || new Date();
    const outstanding = Number(
      billing.outstandingAmount ?? billing.calculation.total ?? 0,
    );
    const paymentAmount =
      amount !== undefined ? Number(amount) : outstanding;
    const appliedDiscount = Number(discount ?? 0);

    if (paymentAmount <= 0) {
      throw new Error("Valor da baixa deve ser maior que zero");
    }
    if (paymentAmount + appliedDiscount > outstanding) {
      throw new Error(
        "Valor de baixa + desconto não pode ser maior que o saldo em aberto",
      );
    }

    await financialService.appendBillingPayment(billing._id, {
      amount: paymentAmount,
      discount: appliedDiscount,
      paidAt,
      paymentMethod,
      notes: discountReason,
      origin: 'billing',
      originId: String(billing._id),
    });

    await transactionService.createSystemIncomeFromSettlement(
      companyId,
      {
        amount: paymentAmount,
        description: `Recebimento do fechamento ${billing.billingNumber}`,
        dueDate: billing.periodEnd,
        paidDate: paidAt,
        relatedTo: { type: 'rental', id: new mongoose.Types.ObjectId(String(billing.rentalId)) },
        paymentMethod,
      },
      String(billing.requestedBy)
    );

    const refreshed = await Billing.findById(billing._id);
    return refreshed as IBilling;
  }

  /**
   * Lista fechamentos com filtros
   */
  async getBillings(
    companyId: string,
    filters: {
      rentalId?: string;
      customerId?: string;
      status?: string;
      startDate?: Date;
      endDate?: Date;
      onlyOverdue?: boolean;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ billings: IBilling[]; total: number; page: number; limit: number }> {
    const query: any = { companyId };

    if (filters.rentalId) {
      query.rentalId = filters.rentalId;
    }

    if (filters.customerId) {
      query.customerId = filters.customerId;
    }

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.startDate || filters.endDate) {
      query.billingDate = {};
      if (filters.startDate) {
        query.billingDate.$gte = filters.startDate;
      }
      if (filters.endDate) {
        query.billingDate.$lte = filters.endDate;
      }
    }
    if (filters.onlyOverdue) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      query.status = { $nin: ['paid', 'cancelled'] };
      query.billingDate = { ...(query.billingDate || {}), $lt: today };
    }

    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const skip = (page - 1) * limit;

    const [billings, total] = await Promise.all([
      Billing.find(query)
        .populate('rentalId')
        .populate('customerId')
        .populate('requestedBy')
        .populate('approvedBy')
        .populate('items.itemId')
        .sort({ billingDate: -1 })
        .skip(skip)
        .limit(limit),
      Billing.countDocuments(query),
    ]);

    return {
      billings,
      total,
      page,
      limit,
    };
  }

  /**
   * Obtém um fechamento por ID
   */
  async getBillingById(companyId: string, billingId: string): Promise<IBilling | null> {
    return Billing.findOne({
      _id: billingId,
      companyId,
    })
      .populate('rentalId')
      .populate('customerId')
      .populate('requestedBy')
      .populate('approvedBy');
  }

  /**
   * Generate PDF for billing
   */
  async generateBillingPDF(companyId: string, billingId: string): Promise<Buffer> {
    const billing = await Billing.findOne({ _id: billingId, companyId })
      .populate('customerId')
      .populate('rentalId')
      .populate('companyId')
      .populate('items.itemId');

    if (!billing) {
      throw new Error('Billing not found');
    }

    const company = billing.companyId as any;
    const customer = billing.customerId as any;
    const rental = billing.rentalId as any;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(20).text('FECHAMENTO', { align: 'center' });
      doc.moveDown();

      // Company Info
      doc.fontSize(12).text(company.name || 'Empresa', { align: 'left' });
      if (company.cnpj) doc.text(`CNPJ: ${company.cnpj}`);
      if (company.email) doc.text(`Email: ${company.email}`);
      if (company.phone) doc.text(`Telefone: ${company.phone}`);
      doc.moveDown();

      // Billing Info
      doc.fontSize(14).text(`Fechamento Nº: ${billing.billingNumber}`);
      doc.text(`Data de Emissão: ${new Date(billing.billingDate).toLocaleDateString('pt-BR')}`);
      doc.text(`Período: ${new Date(billing.periodStart).toLocaleDateString('pt-BR')} até ${new Date(billing.periodEnd).toLocaleDateString('pt-BR')}`);
      if (rental?.rentalNumber) {
        doc.text(`Aluguel: ${rental.rentalNumber}`);
      }
      doc.moveDown();

      // Customer Info
      doc.fontSize(12).text('Cliente:', { underline: true });
      doc.text(customer.name || 'Cliente');
      if (customer.cpfCnpj) doc.text(`CPF/CNPJ: ${customer.cpfCnpj}`);
      if (customer.email) doc.text(`Email: ${customer.email}`);
      if (customer.phone) doc.text(`Telefone: ${customer.phone}`);
      const customerAddresses = customer?.addresses || [];
      const preferredAddress =
        customerAddresses.find((addr: any) => addr.type === 'billing') ||
        customerAddresses.find((addr: any) => addr.type === 'main') ||
        customerAddresses[0];
      if (preferredAddress) {
        const addressLine = [
          preferredAddress.street,
          preferredAddress.number ? `, ${preferredAddress.number}` : '',
        ].join('');
        const complement = preferredAddress.complement
          ? ` - ${preferredAddress.complement}`
          : '';
        const neighborhood = preferredAddress.neighborhood
          ? ` - ${preferredAddress.neighborhood}`
          : '';
        doc.text(`Endereço: ${addressLine}${complement}${neighborhood}`);
        doc.text(
          `${preferredAddress.city || ''}/${preferredAddress.state || ''} - ${preferredAddress.zipCode || ''}`
        );
      }
      doc.moveDown();

      // Items Table
      doc.fontSize(12).text('Equipamentos e serviços:', { underline: true });
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
      billing.items.forEach((item: any) => {
        const itemData = item.itemId as any;
        const description =
          itemData && typeof itemData === 'object' && 'name' in itemData
            ? itemData.name
            : 'Item';
        doc.text(description, 50, y, { width: 240 });
        doc.text(item.quantity.toString(), 300, y);
        doc.text(`R$ ${item.unitPrice.toFixed(2)}`, 350, y, { width: 80, align: 'right' });
        doc.text(`R$ ${item.subtotal.toFixed(2)}`, 450, y, { width: 80, align: 'right' });
        y += itemHeight;
      });

      if (billing.services && billing.services.length > 0) {
        doc.font('Helvetica');
        billing.services.forEach((service: any) => {
          doc.text(service.description || 'Serviço', 50, y, { width: 240 });
          doc.text(String(service.quantity || 1), 300, y);
          doc.text(`R$ ${service.price.toFixed(2)}`, 350, y, { width: 80, align: 'right' });
          doc.text(`R$ ${service.subtotal.toFixed(2)}`, 450, y, { width: 80, align: 'right' });
          y += itemHeight;
        });
      }

      // Totals
      y += 10;
      doc.font('Helvetica');
      doc.text(`Subtotal:`, 350, y, { width: 80, align: 'right' });
      doc.text(`R$ ${billing.calculation.subtotal.toFixed(2)}`, 450, y, { width: 80, align: 'right' });
      y += itemHeight;

      if (billing.calculation.discount && billing.calculation.discount > 0) {
        doc.text(`Desconto:`, 350, y, { width: 80, align: 'right' });
        doc.text(`R$ ${billing.calculation.discount.toFixed(2)}`, 450, y, { width: 80, align: 'right' });
        y += itemHeight;
      }

      doc.font('Helvetica-Bold').fontSize(12);
      doc.text(`Total:`, 350, y, { width: 80, align: 'right' });
      doc.text(`R$ ${billing.calculation.total.toFixed(2)}`, 450, y, { width: 80, align: 'right' });

      if (billing.notes) {
        y += itemHeight * 2;
        doc.font('Helvetica').fontSize(10);
        doc.text('Observações:', 50, y);
        doc.text(billing.notes, 50, y + 15, { width: 500 });
      }

      doc.end();
    });
  }

  /**
   * Lista fechamentos pendentes de aprovação
   */
  async getPendingApprovals(companyId: string): Promise<IBilling[]> {
    return Billing.find({
      companyId,
      status: 'pending_approval',
    })
      .populate('rentalId')
      .populate('customerId')
      .populate('requestedBy')
      .sort({ billingDate: -1 });
  }
}

export default new BillingService();
