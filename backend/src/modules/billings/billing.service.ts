import {
  addBillingDays,
  getPeriodLengthDays,
} from '../../shared/utils/rental-period.util';
import { Billing } from './billing.model';
import { Rental } from '../rentals/rental.model';
import { Item } from '../inventory/item.model';
import { IBilling, IBillingCalculation, RentalType, BillingStatus } from './billing.types';
import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import { financialService } from '../financial/financial.service';
import { transactionService } from '../transactions/transaction.service';
import { Charge } from '../charges/charge.model';
import { asIdString, buildRentalLineKey } from '../../shared/utils/rental-line-key.util';

/**
 * Alinha com RentalService.getEffectivePricingForRentalLines:
 * período mensal/semanal/quinzenal derivado da diária quando o cadastro não tem o período específico.
 */
export function effectivePricingPeriods(pricing?: {
  dailyRate?: number;
  weeklyRate?: number;
  biweeklyRate?: number;
  monthlyRate?: number;
}): {
  dailyRate: number;
  weeklyRate: number;
  biweeklyRate: number;
  monthlyRate: number;
} {
  const dailyRate = Math.max(0, Number(pricing?.dailyRate ?? 0));
  let weeklyRate = Math.max(0, Number(pricing?.weeklyRate ?? 0));
  let biweeklyRate = Math.max(0, Number(pricing?.biweeklyRate ?? 0));
  let monthlyRate = Math.max(0, Number(pricing?.monthlyRate ?? 0));
  if (dailyRate > 0) {
    if (weeklyRate <= 0) weeklyRate = Number((dailyRate * 7).toFixed(2));
    if (biweeklyRate <= 0) biweeklyRate = Number((dailyRate * 15).toFixed(2));
    if (monthlyRate <= 0) monthlyRate = Number((dailyRate * 30).toFixed(2));
  }
  if (dailyRate <= 0) {
    if (weeklyRate > 0 && biweeklyRate <= 0) {
      biweeklyRate = Number(((weeklyRate * 15) / 7).toFixed(2));
    }
    if (biweeklyRate > 0 && weeklyRate <= 0) {
      weeklyRate = Number(((biweeklyRate * 7) / 15).toFixed(2));
    }
    if (weeklyRate > 0 && monthlyRate <= 0) {
      monthlyRate = Number(((weeklyRate * 30) / 7).toFixed(2));
    }
    if (monthlyRate > 0 && weeklyRate <= 0) {
      weeklyRate = Number(((monthlyRate * 7) / 30).toFixed(2));
    }
    if (monthlyRate > 0 && biweeklyRate <= 0) {
      biweeklyRate = Number(((monthlyRate * 15) / 30).toFixed(2));
    }
    if (biweeklyRate > 0 && monthlyRate <= 0) {
      monthlyRate = Number(((biweeklyRate * 30) / 15).toFixed(2));
    }
  }
  return { dailyRate, weeklyRate, biweeklyRate, monthlyRate };
}

/**
 * Valor unitário de cobrança por período conforme o tipo selecionado.
 * Prioriza o valor cadastrado explícito no período solicitado (ex.: quinzenal no SKU);
 * só usa effectivePricingPeriods para derivar quando esse campo está vazio/zero no cadastro.
 */
export function periodRateFromInventory(
  pricing:
    | {
        dailyRate?: number;
        weeklyRate?: number;
        biweeklyRate?: number;
        monthlyRate?: number;
      }
    | undefined,
  rentalType: RentalType,
): { rate: number; message?: string } {
  const rawDaily = Math.max(0, Number(pricing?.dailyRate ?? 0));
  const rawWeekly = Math.max(0, Number(pricing?.weeklyRate ?? 0));
  const rawBiweekly = Math.max(0, Number(pricing?.biweeklyRate ?? 0));
  const rawMonthly = Math.max(0, Number(pricing?.monthlyRate ?? 0));
  const eff = effectivePricingPeriods(pricing);
  switch (rentalType) {
    case "daily":
      if (rawDaily > 0) return { rate: rawDaily };
      if (eff.dailyRate > 0) return { rate: eff.dailyRate };
      return { rate: 0, message: "Cadastre a diária do equipamento." };
    case "weekly":
      if (rawWeekly > 0) return { rate: rawWeekly };
      if (eff.weeklyRate > 0) return { rate: eff.weeklyRate };
      return {
        rate: 0,
        message:
          "Cadastre o valor semanal do equipamento (ou a diária para derivar).",
      };
    case "biweekly":
      if (rawBiweekly > 0) return { rate: rawBiweekly };
      if (eff.biweeklyRate > 0) return { rate: eff.biweeklyRate };
      return {
        rate: 0,
        message:
          "Cadastre o valor quinzenal do equipamento (ou a diária para derivar).",
      };
    case "monthly":
      if (rawMonthly > 0) return { rate: rawMonthly };
      if (eff.monthlyRate > 0) return { rate: eff.monthlyRate };
      return {
        rate: 0,
        message:
          "Cadastre o valor mensal do equipamento (ou a diária para derivar).",
      };
    default:
      return { rate: 0, message: "Tipo de cobrança inválido." };
  }
}

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
  rentalType: RentalType,
): {
  periodsCompleted: number;
  extraDays: number;
  totalPeriods: number;
  chargeExtraPeriod: boolean;
  daysPassed: number;
} {
  const periodLength = getPeriodLengthDays(rentalType);
  const DAY_MS = 1000 * 60 * 60 * 24;

  const s = new Date(pickupDate);
  s.setHours(0, 0, 0, 0);
  const e = new Date(returnDate);
  e.setHours(0, 0, 0, 0);

  let daysPassed: number;
  if (rentalType === "daily") {
    const diffDays = Math.ceil(
      Math.max(0, e.getTime() - s.getTime()) / DAY_MS,
    );
    daysPassed = Math.max(1, diffDays);
  } else {
    const diffMs = e.getTime() - s.getTime();
    if (diffMs < 0) {
      return {
        periodsCompleted: 0,
        extraDays: 0,
        totalPeriods: 0,
        chargeExtraPeriod: false,
        daysPassed: 0,
      };
    }
    // Início e fim contam como dias do período (alinha com fechamentos de data a data no contrato)
    const wholeDaysBetween = Math.floor(diffMs / DAY_MS);
    daysPassed = Math.max(1, wholeDaysBetween + 1);
  }

  const periodsCompleted = Math.floor(daysPassed / periodLength);
  const extraDays = daysPassed % periodLength;

  // Valor do fechamento usa períodos inteiros (ver calculateRentalLineAmount); extraDays só apoia o arredondamento.
  const chargeExtraPeriod = false;
  const totalPeriods = periodsCompleted;

  return {
    periodsCompleted,
    extraDays,
    totalPeriods,
    chargeExtraPeriod,
    daysPassed,
  };
}

/**
 * Cobrança linear no intervalo: (tarifa do período / dias do período) × dias corridos (inclusivos),
 * igual ao proporcional já usado no fallback computeItemPartialSubtotal.
 * Em fechamentos por devolução evita usar a diária cadastrada isolada quando o período é incompleto.
 */
export function calculateProportionalIntervalAmount(
  pricing:
    | {
        dailyRate?: number;
        weeklyRate?: number;
        biweeklyRate?: number;
        monthlyRate?: number;
      }
    | undefined,
  rentalType: RentalType,
  daysPassed: number,
): { amount: number; periodRate: number } {
  const p = effectivePricingPeriods(pricing);
  const dp = Math.max(0, Number(daysPassed || 0));
  if (dp <= 0) {
    return { amount: 0, periodRate: 0 };
  }
  const periodRates: Record<RentalType, number> = {
    daily: Math.max(0, Number(p.dailyRate ?? 0)),
    weekly: Math.max(0, Number(p.weeklyRate ?? 0)),
    biweekly: Math.max(0, Number(p.biweeklyRate ?? 0)),
    monthly: Math.max(0, Number(p.monthlyRate ?? 0)),
  };
  const periodRate = periodRates[rentalType];
  const periodLen = getPeriodLengthDays(rentalType);
  if (rentalType === "daily") {
    return {
      amount: Number((periodRate * dp).toFixed(2)),
      periodRate,
    };
  }
  if (periodLen <= 0 || periodRate <= 0) {
    return { amount: 0, periodRate };
  }
  const impliedDaily = periodRate / periodLen;
  return {
    amount: Number((impliedDaily * dp).toFixed(2)),
    periodRate,
  };
}

export function calculateRentalLineAmount(
  pricing: {
    dailyRate?: number;
    weeklyRate?: number;
    biweeklyRate?: number;
    monthlyRate?: number;
  } | undefined,
  rentalType: RentalType,
  period: {
    periodsCompleted: number;
    extraDays: number;
  },
): { amount: number; periodRate: number; dailyRate: number } {
  const eff = effectivePricingPeriods(pricing);
  const dailyResolved = periodRateFromInventory(pricing, "daily");
  const configuredDaily =
    dailyResolved.rate > 0 ? dailyResolved.rate : eff.dailyRate;

  const periodsCompleted = Math.max(0, Number(period.periodsCompleted || 0));
  const extraDays = Math.max(0, Number(period.extraDays || 0));

  if (rentalType === "daily") {
    const billedDays = Math.max(1, periodsCompleted);
    return {
      amount: Number((configuredDaily * billedDays).toFixed(2)),
      periodRate: configuredDaily,
      dailyRate: configuredDaily,
    };
  }

  const { rate: periodRate, message } = periodRateFromInventory(
    pricing,
    rentalType,
  );
  /** Semanal/quinzenal/mensal: qualquer fração de período conta como um período cheio (ex.: 14 dias em ciclo de 15 = 1 quinzena). */
  const billablePeriods = periodsCompleted + (extraDays > 0 ? 1 : 0);
  if (billablePeriods > 0 && periodRate <= 0) {
    throw new Error(
      message ||
        "Cadastre no equipamento a tarifa do período (semanal/quinzenal/mensal) ou a diária para derivar.",
    );
  }

  return {
    amount: Number((periodRate * billablePeriods).toFixed(2)),
    periodRate,
    dailyRate: configuredDaily,
  };
}

function addPeriod(date: Date, rentalType: RentalType): Date {
  return addBillingDays(date, getPeriodLengthDays(rentalType));
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
  private async resolvePeriodRateForBilling(
    companyId: string,
    item: any,
    rentalType: RentalType,
  ): Promise<{ lineUnit: number; pricing: any; autoNote?: string }> {
    const inv = await Item.findOne({
      _id: asIdString(item.itemId),
      companyId,
    }).lean();
    if (!inv) {
      throw new Error(
        `Equipamento não encontrado. Não é possível definir valor do fechamento (item ${item.itemId}).`,
      );
    }

    const { rate, message } = periodRateFromInventory(inv.pricing, rentalType);
    if (rate <= 0) {
      throw new Error(
        message || `Cadastre no equipamento "${inv.name}" o valor da cobrança (${rentalType}).`,
      );
    }

    return { lineUnit: rate, pricing: inv.pricing, autoNote: message };
  }

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
        const billQty = Number(billingItem?.quantity ?? 0);
        matchIdx = rentalItems.findIndex((ri: any, idx: number) => {
          if (usedIndices.has(idx)) return false;
          const riId = asIdString(ri?.itemId);
          if (riId !== billingItemId) return false;
          if (billingUnitId) {
            if (String(ri?.unitId || "") !== billingUnitId) return false;
          } else if (ri.unitId) {
            return false;
          }
          if (billQty > 0 && Number(ri?.quantity ?? 0) !== billQty) return false;
          return true;
        });
      }

      if (matchIdx >= 0) {
        usedIndices.add(matchIdx);
        selected.push(rentalItems[matchIdx]);
      }
    }

    return selected.length
      ? selected
      : rentalItems.filter((ri: any) => !ri.returnActual);
  }

  private computeLineCharge(
    pricing: any,
    lineRentalType: RentalType,
    periodCalculation: ReturnType<typeof calculateBillingPeriod>,
  ): { amount: number; periodsCharged: number } {
    const { amount } = calculateRentalLineAmount(
      pricing,
      lineRentalType,
      periodCalculation,
    );
    if (lineRentalType === 'daily') {
      return { amount, periodsCharged: periodCalculation.periodsCompleted };
    }
    const billablePeriods =
      periodCalculation.periodsCompleted +
      (periodCalculation.extraDays > 0 ? 1 : 0);
    return { amount, periodsCharged: billablePeriods };
  }

  private async buildScopedBillingItems(
    companyId: string,
    scopedRentalItems: any[],
    rentalType: RentalType,
    periodCalculation: ReturnType<typeof calculateBillingPeriod>,
  ): Promise<{ items: any[]; equipmentSubtotal: number }> {
    let equipmentSubtotal = 0;
    const items: any[] = [];

    for (const item of scopedRentalItems) {
      const { lineUnit, pricing } = await this.resolvePeriodRateForBilling(
        companyId,
        item,
        rentalType,
      );

      const { amount, periodsCharged } = this.computeLineCharge(
        pricing,
        rentalType,
        periodCalculation,
      );
      const subtotal = amount * Number(item.quantity || 0);
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
    const wantKey = buildRentalLineKey(lineItem);
    const idx = rental.items.findIndex((ri: any) => {
      return buildRentalLineKey(ri) === wantKey;
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
      const inv = await Item.findOne({
        _id: asIdString(it.itemId),
        companyId,
      }).lean();
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
    const isServiceOnlyBilling =
      (billing.items?.length ?? 0) === 0 &&
      ((billing.services?.length ?? 0) > 0 || Number(billing.calculation?.servicesAmount ?? 0) > 0);
    const scopedRentalItems = isServiceOnlyBilling ? [] : this.pickRentalItemsForBilling(rental, billing);
    const isScopedBilling = scopedRentalItems.length > 0;
    const { equipmentSubtotal } = isServiceOnlyBilling
      ? { equipmentSubtotal: 0 }
      : isScopedBilling
        ? await this.buildScopedBillingItems(
          companyId,
          scopedRentalItems,
          rentalType,
          periodCalculation,
        )
        : await this.buildBillingItems(
          companyId,
          rental,
          rentalType,
          periodCalculation,
          undefined,
        );
    const { servicesSubtotal } = this.buildBillingServices(rental, isServiceOnlyBilling);
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

    const isServiceOnlyBilling =
      (billing.items?.length ?? 0) === 0 &&
      ((billing.services?.length ?? 0) > 0 || Number(billing.calculation?.servicesAmount ?? 0) > 0);
    const hadLegacyServicesOnItemBilling =
      !isServiceOnlyBilling &&
      ((billing.services?.length ?? 0) > 0 || Number(billing.calculation?.servicesAmount ?? 0) > 0);
    const scopedRentalItems = isServiceOnlyBilling ? [] : this.pickRentalItemsForBilling(rental, billing);
    const isScopedBilling = scopedRentalItems.length > 0;
    const { items, equipmentSubtotal } = isServiceOnlyBilling
      ? { items: [], equipmentSubtotal: 0 }
      : isScopedBilling
        ? await this.buildScopedBillingItems(
          companyId,
          scopedRentalItems,
          rentalType,
          periodCalculation,
        )
        : await this.buildBillingItems(
          companyId,
          rental,
          rentalType,
          periodCalculation,
          undefined,
        );
    const { services, servicesSubtotal } = this.buildBillingServices(rental, isServiceOnlyBilling);
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

    const serviceBilling = hadLegacyServicesOnItemBilling
      ? await this.createServiceBillingIfNeeded(
        companyId,
        rental,
        periodStart,
        periodEnd,
        String(billing.requestedBy || billing.approvedBy || rental.createdBy),
        { notes: rental.notes, status: billing.status as BillingStatus },
      )
      : null;

    if (serviceBilling && billing.chargeId) {
      const charge = await Charge.findOne({ _id: billing.chargeId, companyId });
      if (
        charge &&
        charge.status !== 'paid' &&
        charge.status !== 'cancelled' &&
        !(charge.billingIds || []).some((id: any) => String(id) === String(serviceBilling._id))
      ) {
        charge.billingIds.push(serviceBilling._id as any);
        await financialService.attachBillingToCharge(serviceBilling._id, charge._id);
        await charge.save();
      }
    }

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
    periodCalculation: ReturnType<typeof calculateBillingPeriod>,
    targetEquipmentSubtotal?: number,
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
    const billingItems: any[] = [];
    for (const item of rental.items) {
      if (item.returnActual) continue;
      const itemRentalType: RentalType = item.rentalType || rentalType;
      const { lineUnit, pricing } = await this.resolvePeriodRateForBilling(
        companyId,
        item,
        itemRentalType,
      );
      const unitPricePerPeriod = lineUnit * scaleFactor;
      const { amount, periodsCharged } = this.computeLineCharge(
        pricing,
        itemRentalType,
        periodCalculation,
      );
      const subtotal = amount * scaleFactor * item.quantity;
      equipmentSubtotal += subtotal;

      billingItems.push({
        itemId: item.itemId,
        unitId: item.unitId,
        rentalLineKey: buildRentalLineKey(item),
        quantity: item.quantity,
        unitPrice: Number(unitPricePerPeriod.toFixed(2)),
        periodsCharged,
        subtotal: Number(subtotal.toFixed(2)),
      });
    }

    return { items: billingItems, equipmentSubtotal: Number(equipmentSubtotal.toFixed(2)) };
  }

  private buildBillingServices(rental: any, includeServices: boolean): { services: any[]; servicesSubtotal: number } {
    if (!includeServices) {
      return { services: [], servicesSubtotal: 0 };
    }

    let servicesSubtotal = 0;
    const billingServices = (rental.services || []).map((service: any) => {
      const quantity = Number(service.quantity || 1);
      const subtotal = Number(service.subtotal ?? Number(service.price || 0) * quantity);
      servicesSubtotal += subtotal;
      return {
        description: service.description,
        price: Number(service.price || 0),
        quantity,
        subtotal,
      };
    });

    return { services: billingServices, servicesSubtotal: Number(servicesSubtotal.toFixed(2)) };
  }

  private async createServiceBillingIfNeeded(
    companyId: string,
    rental: any,
    periodStart: Date,
    periodEnd: Date,
    userId: string,
    options?: { notes?: string; status?: BillingStatus },
  ): Promise<IBilling | null> {
    const { services, servicesSubtotal } = this.buildBillingServices(rental, true);
    if (!services.length || servicesSubtotal <= 0) return null;

    const existing = await Billing.findOne({
      companyId,
      rentalId: rental._id,
      'services.0': { $exists: true },
      items: { $size: 0 },
      status: { $ne: 'cancelled' },
    });
    if (existing) return existing as IBilling;

    const normalizedStart = new Date(periodStart);
    normalizedStart.setHours(0, 0, 0, 0);
    const normalizedEnd = new Date(periodEnd);
    normalizedEnd.setHours(0, 0, 0, 0);
    const rentalType: RentalType = rental.dates?.billingCycle || rental.items?.[0]?.rentalType || 'daily';

    return createBillingWithRetry({
      companyId,
      rentalId: rental._id,
      customerId: rental.customerId,
      billingDate: new Date(),
      periodStart: normalizedStart,
      periodEnd: normalizedEnd,
      rentalType,
      calculation: {
        baseRate: 0,
        periodsCompleted: 0,
        extraDays: 0,
        chargeExtraPeriod: false,
        baseAmount: 0,
        servicesAmount: servicesSubtotal,
        subtotal: servicesSubtotal,
        discount: 0,
        total: servicesSubtotal,
      },
      items: [],
      services,
      status: options?.status || 'approved',
      financialStage: 'pending',
      governance: 'charge',
      outstandingAmount: servicesSubtotal,
      approvalRequired: false,
      requestedBy: userId,
      notes: options?.notes ? `${options.notes}\nServiços do aluguel em fechamento separado.` : 'Serviços do aluguel em fechamento separado.',
    });
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

    const { items, equipmentSubtotal } = await this.buildBillingItems(
      companyId,
      rental,
      rentalType,
      periodCalculation,
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

    const autoNotes: string[] = [];
    const { lineUnit, pricing, autoNote } = await this.resolvePeriodRateForBilling(
      companyId,
      item,
      rentalType,
    );
    if (autoNote) {
      console.warn('[Fechamento]', autoNote);
      autoNotes.push(autoNote);
    }
    await this.persistRentalLineUnitPrice(companyId, rental._id, item, lineUnit);

    const { amount, periodsCharged } = this.computeLineCharge(
      pricing,
      rentalType,
      periodCalculation,
    );
    const itemSubtotal = amount * item.quantity;
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

    const shouldCreateServiceBilling =
      (await Billing.countDocuments({
        companyId,
        rentalId,
        'services.0': { $exists: true },
        items: { $size: 0 },
        status: { $ne: 'cancelled' },
      })) === 0;

    const createdBillings: IBilling[] = [];
    const normalizedReturnDate = new Date(returnDate);
    normalizedReturnDate.setHours(0, 0, 0, 0);

    if (shouldCreateServiceBilling) {
      const serviceBilling = await this.createServiceBillingIfNeeded(
        companyId,
        rental,
        new Date(rental.dates?.pickupScheduled || rental.items?.[0]?.pickupScheduled || normalizedReturnDate),
        normalizedReturnDate,
        userId,
        { notes: rental.notes, status: 'approved' },
      );
      if (serviceBilling) {
        createdBillings.push(serviceBilling);
      }
    }

    for (const item of rental.items) {
      if (item.returnActual) {
        continue;
      }
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
          includeServices: false,
          notes: rental.notes,
          discount: createdBillings.filter((b) => (b.items?.length ?? 0) > 0).length === 0 ? discount : 0,
          discountReason: createdBillings.filter((b) => (b.items?.length ?? 0) > 0).length === 0 ? discountReason : undefined,
          status: "approved",
        },
      );

      createdBillings.push(billing);
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
      y += itemHeight;
      doc.font('Helvetica').fontSize(10);
      doc.text(`Saldo em aberto:`, 350, y, { width: 80, align: 'right' });
      doc.text(
        `R$ ${Number(billing.outstandingAmount ?? billing.calculation.total ?? 0).toFixed(2)}`,
        450,
        y,
        { width: 80, align: 'right' },
      );

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
