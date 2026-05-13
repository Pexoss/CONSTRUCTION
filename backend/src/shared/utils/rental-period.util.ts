import type { RentalType } from "../../modules/billings/billing.types";

/**
 * Única fonte para tamanhos de ciclo de fechamento (alinhado a calculateBillingPeriod em billing.service).
 */
export function getPeriodLengthDays(rentalType: RentalType): number {
  const periodDays: Record<RentalType, number> = {
    daily: 1,
    weekly: 7,
    biweekly: 15,
    monthly: 30,
  };
  return periodDays[rentalType];
}

export function normalizeDateForBilling(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

export function addBillingDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Fim do período inclusivo (ex.: semanal 7 dias → start + 6). Igual RentalService.getPeriodEnd. */
export function getPeriodEndInclusive(
  startDate: Date,
  rentalType: RentalType,
): Date {
  const normalizedStart = normalizeDateForBilling(startDate);
  return addBillingDays(
    normalizedStart,
    getPeriodLengthDays(rentalType) - 1,
  );
}
