import type { RentalType } from "../billings/billing.types";
import {
  normalizeDateForBilling,
  addBillingDays,
  getPeriodEndInclusive,
} from "../../shared/utils/rental-period.util";

/**
 * Espelha RentalService.processDueBillings (ramo não-diário) para testes e documentação.
 * Não acessa MongoDB.
 */
export interface SimRentalItem {
  pickupScheduled: Date;
  rentalType: RentalType;
  returnScheduled?: Date | null;
  returnActual?: Date | null;
  lastBillingDate?: Date | null;
  nextBillingDate?: Date | null;
  retroactiveOpenBilling?: boolean;
}

export type SimulatedClosureKind = "approved" | "draft";

export interface SimulatedPeriodicClosure {
  periodStart: Date;
  periodEnd: Date;
  kind: SimulatedClosureKind;
}

function billingHorizonForItem(item: SimRentalItem, today: Date): Date {
  const t = normalizeDateForBilling(today);
  if (item.returnActual) {
    const a = normalizeDateForBilling(item.returnActual);
    return a.getTime() <= t.getTime() ? a : t;
  }
  if (
    item.retroactiveOpenBilling &&
    item.returnScheduled &&
    normalizeDateForBilling(item.returnScheduled) < t
  ) {
    return t;
  }
  if (!item.returnScheduled) {
    return t;
  }
  const s = normalizeDateForBilling(item.returnScheduled);
  if (s.getTime() > t.getTime()) {
    return t;
  }
  return s;
}

function contractualReturnForDraft(item: SimRentalItem): Date | null {
  if (item.returnActual) {
    return normalizeDateForBilling(item.returnActual);
  }
  if (item.returnScheduled != null && item.returnScheduled !== undefined) {
    return normalizeDateForBilling(item.returnScheduled);
  }
  if (item.retroactiveOpenBilling) {
    return null;
  }
  return null;
}

/** Igual ao loop em RentalService.processDueBillings para ciclos weekly/biweekly/monthly. */
export function simulateNonDailyPeriodicClosures(
  item: SimRentalItem,
  now: Date,
): SimulatedPeriodicClosure[] {
  const cycle = item.rentalType || "daily";
  if (cycle === "daily") {
    return [];
  }

  const pickupBase = normalizeDateForBilling(item.pickupScheduled);
  const horizon = billingHorizonForItem(item, now);
  const draftCap = contractualReturnForDraft(item);

  let lastBillingDate = item.lastBillingDate
    ? normalizeDateForBilling(item.lastBillingDate)
    : addBillingDays(pickupBase, -1);
  let periodStart = addBillingDays(lastBillingDate, 1);
  let expectedNextBillingDate = getPeriodEndInclusive(periodStart, cycle);
  let nextBillingDate = item.nextBillingDate
    ? normalizeDateForBilling(item.nextBillingDate)
    : expectedNextBillingDate;

  if (
    nextBillingDate.getTime() < periodStart.getTime() ||
    nextBillingDate.getTime() > expectedNextBillingDate.getTime()
  ) {
    nextBillingDate = expectedNextBillingDate;
  }

  const out: SimulatedPeriodicClosure[] = [];
  const n = normalizeDateForBilling(now);

  while (
    nextBillingDate.getTime() <= n.getTime() &&
    nextBillingDate.getTime() <= horizon.getTime()
  ) {
    out.push({
      periodStart: normalizeDateForBilling(periodStart),
      periodEnd: normalizeDateForBilling(nextBillingDate),
      kind: "approved",
    });
    lastBillingDate = normalizeDateForBilling(nextBillingDate);
    periodStart = addBillingDays(nextBillingDate, 1);
    expectedNextBillingDate = getPeriodEndInclusive(periodStart, cycle);
    nextBillingDate = expectedNextBillingDate;
  }

  /** Ver processDueBillings (trecho até devolução/hoje; omitido com contrato vigente e devolução futura). */
  const capNorm = normalizeDateForBilling(horizon);
  const retroOverdueBillingToToday =
    !!item.retroactiveOpenBilling &&
    draftCap !== null &&
    draftCap.getTime() < n.getTime();
  const skipTailApprovedOpenContract =
    !item.returnActual &&
    draftCap !== null &&
    capNorm.getTime() < draftCap.getTime() &&
    !retroOverdueBillingToToday;

  const tailStartNorm = normalizeDateForBilling(periodStart);
  if (
    !skipTailApprovedOpenContract &&
    tailStartNorm.getTime() < capNorm.getTime() &&
    tailStartNorm.getTime() <= capNorm.getTime()
  ) {
    const nextFullNorm = normalizeDateForBilling(nextBillingDate);
    if (capNorm.getTime() <= nextFullNorm.getTime()) {
      out.push({
        periodStart: tailStartNorm,
        periodEnd: capNorm,
        kind: "approved",
      });
      lastBillingDate = capNorm;
      periodStart = addBillingDays(capNorm, 1);
      nextBillingDate = getPeriodEndInclusive(periodStart, cycle);
    }
  }

  const draftAllowedByContract =
    draftCap === null ||
    normalizeDateForBilling(periodStart).getTime() <= draftCap.getTime();

  if (nextBillingDate.getTime() > n.getTime() && draftAllowedByContract) {
    out.push({
      periodStart: normalizeDateForBilling(periodStart),
      periodEnd: normalizeDateForBilling(nextBillingDate),
      kind: "draft",
    });
  }

  return out;
}

/** Formata data local YYYY-MM-DD (evita deslocar fuso como toISOString). */
export function formatYmdLocal(d: Date): string {
  const x = normalizeDateForBilling(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
