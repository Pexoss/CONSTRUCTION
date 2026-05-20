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

/** Data “só dia” no sistema: meia-noite local sem fração de hora. */
export function isLocalMidnight(d: Date): boolean {
  return (
    d.getHours() === 0 &&
    d.getMinutes() === 0 &&
    d.getSeconds() === 0 &&
    d.getMilliseconds() === 0
  );
}

/**
 * Diária por relógio a partir da retirada:
 * - 1ª diária: até 24h após o início;
 * - cada diária extra: só após ultrapassar mais 26h (24h de período + 2h de tolerância na devolução).
 */
export function countRollingDailyBillingUnits(elapsedMs: number): number {
  if (elapsedMs <= 0) {
    return 0;
  }
  const HOUR_MS = 1000 * 60 * 60;
  const firstWindowMs = 24 * HOUR_MS;
  const extraWindowMs = 26 * HOUR_MS;
  if (elapsedMs <= firstWindowMs) {
    return 1;
  }
  return 1 + Math.ceil((elapsedMs - firstWindowMs) / extraWindowMs);
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
