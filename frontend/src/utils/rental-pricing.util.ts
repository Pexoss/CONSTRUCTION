/**
 * Espelha backend/billings/billing.service.ts — exibição na UI usa a mesma
 * prioridade: valor cadastrado no período (ex.: quinzenal) antes de derivar.
 */
export type RentalTypePricing = "daily" | "weekly" | "biweekly" | "monthly";

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

/** Valor explícito no cadastro do período (sem derivar de diária/outros). */
export function registeredPeriodRateFromInventory(
  pricing:
    | {
        dailyRate?: number;
        weeklyRate?: number;
        biweeklyRate?: number;
        monthlyRate?: number;
      }
    | undefined,
  rentalType: RentalTypePricing,
): number {
  if (!pricing) return 0;
  switch (rentalType) {
    case "daily":
      return Math.max(0, Number(pricing.dailyRate ?? 0));
    case "weekly":
      return Math.max(0, Number(pricing.weeklyRate ?? 0));
    case "biweekly":
      return Math.max(0, Number(pricing.biweeklyRate ?? 0));
    case "monthly":
      return Math.max(0, Number(pricing.monthlyRate ?? 0));
    default:
      return 0;
  }
}

export function periodRateFromInventory(
  pricing:
    | {
        dailyRate?: number;
        weeklyRate?: number;
        biweeklyRate?: number;
        monthlyRate?: number;
      }
    | undefined,
  rentalType: RentalTypePricing,
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
      // Quinzenal: só valor explícito (igual ao backend).
      if (rawBiweekly > 0) return { rate: rawBiweekly };
      return {
        rate: 0,
        message:
          "Cadastre o valor quinzenal no cadastro do equipamento (15 dias). Não basta ter só semanal ou mensal — o período quinzenal deve estar explícito.",
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

export function applyPeriodRateOverride(
  pricing:
    | {
        dailyRate?: number;
        weeklyRate?: number;
        biweeklyRate?: number;
        monthlyRate?: number;
      }
    | undefined,
  rentalType: RentalTypePricing,
  overrideRate: number,
) {
  const base = { ...(pricing || {}) };
  const rate = Number(overrideRate.toFixed(2));
  switch (rentalType) {
    case "daily":
      base.dailyRate = rate;
      break;
    case "weekly":
      base.weeklyRate = rate;
      break;
    case "biweekly":
      base.biweeklyRate = rate;
      break;
    case "monthly":
      base.monthlyRate = rate;
      break;
  }
  return base;
}
