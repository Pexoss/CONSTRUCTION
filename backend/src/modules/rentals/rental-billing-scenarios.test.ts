import { describe, it, expect } from "vitest";
import {
  calculateBillingPeriod,
  calculateRentalLineAmount,
  periodRateFromInventory,
} from "../billings/billing.service";
import {
  simulateNonDailyPeriodicClosures,
  formatYmdLocal,
} from "./rental-billing-simulation";

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe("rental billing — cálculo único (billing.service)", () => {
  it("periodRateFromInventory: valor quinzenal cadastrado prevalece sobre derivação semanal/mensal", () => {
    expect(
      periodRateFromInventory(
        { monthlyRate: 168, weeklyRate: 39.2, biweeklyRate: 13 },
        "biweekly",
      ).rate,
    ).toBe(13);
  });

  it("calculateRentalLineAmount quinzenal: tarifa cadastrada (13) vence derivação a partir do mensal", () => {
    const period = calculateBillingPeriod(
      d(2026, 4, 1),
      d(2026, 4, 15),
      "biweekly",
    );
    const { amount, periodRate } = calculateRentalLineAmount(
      { monthlyRate: 168, weeklyRate: 39.2, biweeklyRate: 13 },
      "biweekly",
      period,
    );
    expect(periodRate).toBe(13);
    expect(amount).toBe(13);
  });

  it("createPeriodicBillingForItem usa calculateBillingPeriod + calculateRentalLineAmount (mensal 01/04→30/04)", () => {
    const start = d(2026, 4, 1);
    const end = d(2026, 4, 30);
    const period = calculateBillingPeriod(start, end, "monthly");
    const { amount } = calculateRentalLineAmount(
      { monthlyRate: 15 },
      "monthly",
      period,
    );
    expect(amount).toBe(15);
    expect(amount * 50).toBe(750);
  });

  it("diária inclusiva: 01/04 → 03/04 = 3 dias / 3 diárias", () => {
    const period = calculateBillingPeriod(d(2026, 4, 1), d(2026, 4, 3), "daily");
    expect(period.daysPassed).toBe(3);
    const { amount } = calculateRentalLineAmount({ dailyRate: 10 }, "daily", period);
    expect(amount).toBe(30);
  });

  it("quinzenal exige tarifa quinzenal explícita no cadastro (não deriva só da semanal)", () => {
    const start = d(2026, 4, 1);
    const end = d(2026, 4, 15);
    const period = calculateBillingPeriod(start, end, "biweekly");
    expect(period.extraDays).toBe(0);
    const { amount } = calculateRentalLineAmount(
      { weeklyRate: 70, biweeklyRate: 150 },
      "biweekly",
      period,
    );
    expect(amount).toBe(150);
  });

  /* Primeira fatia < ciclo cobra 1 quinzena inteira quando não há período completo antes (ex.: 14 dias corrido na quinzena de 15) */
  it("quinzenal 01/04–14/04 com biweekly cadastrado: valor = 1 quinzena (não 14× diária derivada)", () => {
    const period = calculateBillingPeriod(d(2026, 4, 1), d(2026, 4, 14), "biweekly");
    expect(period.periodsCompleted).toBe(0);
    expect(period.extraDays).toBeGreaterThan(0);
    const { amount } = calculateRentalLineAmount(
      { biweeklyRate: 13 },
      "biweekly",
      period,
    );
    expect(amount).toBe(13);
  });

  it("quinzenal: período cheio + 1 dia conta como dois períodos inteiros (sem diárias)", () => {
    const period = calculateBillingPeriod(
      d(2026, 4, 1),
      d(2026, 4, 16),
      "biweekly",
    );
    expect(period.periodsCompleted).toBe(1);
    expect(period.extraDays).toBe(1);
    const { amount } = calculateRentalLineAmount(
      { biweeklyRate: 150 },
      "biweekly",
      period,
    );
    expect(amount).toBe(300);
  });

  it("mensal: trecho menor que 30 dias cobra um mês inteiro (valor do período, não proporcional aos dias)", () => {
    const period = calculateBillingPeriod(
      d(2026, 4, 1),
      d(2026, 4, 14),
      "monthly",
    );
    expect(period.daysPassed).toBe(14);
    expect(period.periodsCompleted).toBe(0);
    const floored = calculateRentalLineAmount(
      { monthlyRate: 450, dailyRate: 6 },
      "monthly",
      period,
    );
    expect(floored.amount).toBe(450);
  });
});

describe("cenário exemplo — fechamentos periódicos (simulação = processDueBillings)", () => {
  const nowBaseline = d(2026, 5, 6);

  it("50 Andaimes mensal desde 01/04: abr fechado + maio proporcional até 06/05 + rascunho do ciclo seguinte", () => {
    const rows = simulateNonDailyPeriodicClosures(
      {
        pickupScheduled: d(2026, 4, 1),
        rentalType: "monthly",
      },
      nowBaseline,
    );
    const approved = rows.filter((r) => r.kind === "approved");
    const draft = rows.filter((r) => r.kind === "draft");
    expect(approved).toHaveLength(2);
    expect(formatYmdLocal(approved[0].periodStart)).toBe("2026-04-01");
    expect(formatYmdLocal(approved[0].periodEnd)).toBe("2026-04-30");
    expect(formatYmdLocal(approved[1].periodStart)).toBe("2026-05-01");
    expect(formatYmdLocal(approved[1].periodEnd)).toBe("2026-05-06");
    expect(draft).toHaveLength(1);
    expect(formatYmdLocal(draft[0].periodStart)).toBe("2026-05-07");
    expect(formatYmdLocal(draft[0].periodEnd)).toBe("2026-06-05");
  });

  it("Container semanal desde 01/04: 5 períodos aprovados até 05/05 + 1 rascunho 06/05–12/05 (data simulada 06/05/2026)", () => {
    const rows = simulateNonDailyPeriodicClosures(
      {
        pickupScheduled: d(2026, 4, 1),
        rentalType: "weekly",
      },
      nowBaseline,
    );
    const approved = rows.filter((r) => r.kind === "approved");
    const draft = rows.filter((r) => r.kind === "draft");
    expect(approved).toHaveLength(5);
    expect(draft).toHaveLength(1);
    const ends = approved.map((r) => formatYmdLocal(r.periodEnd));
    expect(ends).toEqual([
      "2026-04-07",
      "2026-04-14",
      "2026-04-21",
      "2026-04-28",
      "2026-05-05",
    ]);
    expect(formatYmdLocal(draft[0].periodStart)).toBe("2026-05-06");
    expect(formatYmdLocal(draft[0].periodEnd)).toBe("2026-05-12");
  });

  it("Betoneira quinzenal desde 01/04 em 06/05/2026: 3 aprovados (abr + trecho proporcional até 06/05) + rascunho", () => {
    const rows = simulateNonDailyPeriodicClosures(
      {
        pickupScheduled: d(2026, 4, 1),
        rentalType: "biweekly",
      },
      nowBaseline,
    );
    const approved = rows.filter((r) => r.kind === "approved");
    const draft = rows.filter((r) => r.kind === "draft");
    expect(approved).toHaveLength(3);
    expect(formatYmdLocal(approved[0].periodEnd)).toBe("2026-04-15");
    expect(formatYmdLocal(approved[1].periodEnd)).toBe("2026-04-30");
    expect(formatYmdLocal(approved[2].periodEnd)).toBe("2026-05-06");
    expect(draft).toHaveLength(1);
    expect(formatYmdLocal(draft[0].periodStart)).toBe("2026-05-07");
    expect(formatYmdLocal(draft[0].periodEnd)).toBe("2026-05-21");
  });

  describe("alteração 1 — devolução Container em 14/04/2026", () => {
    it("só 01/04–07/04 e 08/04–14/04; sem rascunho posterior nem outros afetados (lógica de horizonte)", () => {
      const rows = simulateNonDailyPeriodicClosures(
        {
          pickupScheduled: d(2026, 4, 1),
          rentalType: "weekly",
          returnActual: d(2026, 4, 14),
        },
        nowBaseline,
      );
      expect(rows.every((r) => r.kind === "approved")).toBe(true);
      expect(rows).toHaveLength(2);
      expect(formatYmdLocal(rows[0].periodEnd)).toBe("2026-04-07");
      expect(formatYmdLocal(rows[1].periodEnd)).toBe("2026-04-14");
    });
  });

  describe("alteração 2 — Betoneira passa a mensal", () => {
    it("abril fechado + maio proporcional até 06/05 aprovado + rascunho do ciclo seguinte", () => {
      const rows = simulateNonDailyPeriodicClosures(
        {
          pickupScheduled: d(2026, 4, 1),
          rentalType: "monthly",
        },
        nowBaseline,
      );
      const a = rows.filter((r) => r.kind === "approved");
      const dr = rows.filter((r) => r.kind === "draft");
      expect(a).toHaveLength(2);
      expect(dr).toHaveLength(1);
      expect(formatYmdLocal(a[0].periodEnd)).toBe("2026-04-30");
      expect(formatYmdLocal(a[1].periodEnd)).toBe("2026-05-06");
      expect(formatYmdLocal(dr[0].periodStart)).toBe("2026-05-07");
      expect(formatYmdLocal(dr[0].periodEnd)).toBe("2026-06-05");
    });
  });

  describe("alteração 3 — andames em duas linhas (30 mensal + 20 quinzenal)", () => {
    it("linha 30 mensal: 2 aprovados (abr + partial mai até 06/05) + rascunho seguinte", () => {
      const rows = simulateNonDailyPeriodicClosures(
        {
          pickupScheduled: d(2026, 4, 1),
          rentalType: "monthly",
        },
        nowBaseline,
      );
      expect(rows).toHaveLength(3);
    });

    it("quinzenal prevista 14/04: tail 01/04–14/04 aprovado (antes do ciclo inteiro até 15/04)", () => {
      const rows = simulateNonDailyPeriodicClosures(
        {
          pickupScheduled: d(2026, 4, 1),
          rentalType: "biweekly",
          returnScheduled: d(2026, 4, 14),
        },
        nowBaseline,
      );
      const approved = rows.filter((r) => r.kind === "approved");
      expect(approved).toHaveLength(1);
      expect(formatYmdLocal(approved[0].periodStart)).toBe("2026-04-01");
      expect(formatYmdLocal(approved[0].periodEnd)).toBe("2026-04-14");
    });

    it("quinzenal devolução registrada em 07/04: apenas 01/04–07/04 aprovado", () => {
      const rows = simulateNonDailyPeriodicClosures(
        {
          pickupScheduled: d(2026, 4, 1),
          rentalType: "biweekly",
          returnActual: d(2026, 4, 7),
        },
        d(2026, 5, 6),
      );
      const approved = rows.filter((r) => r.kind === "approved");
      expect(approved).toHaveLength(1);
      expect(formatYmdLocal(approved[0].periodStart)).toBe("2026-04-01");
      expect(formatYmdLocal(approved[0].periodEnd)).toBe("2026-04-07");
    });

    it("linha 20 quinzenal com devolução prevista 15/04: só 01/04–15/04 aprovado (horizonte na devolução)", () => {
      const rows = simulateNonDailyPeriodicClosures(
        {
          pickupScheduled: d(2026, 4, 1),
          rentalType: "biweekly",
          returnScheduled: d(2026, 4, 15),
        },
        nowBaseline,
      );
      const approved = rows.filter((r) => r.kind === "approved");
      const draft = rows.filter((r) => r.kind === "draft");
      expect(approved).toHaveLength(1);
      expect(formatYmdLocal(approved[0].periodStart)).toBe("2026-04-01");
      expect(formatYmdLocal(approved[0].periodEnd)).toBe("2026-04-15");
      expect(draft).toHaveLength(0);
    });
  });

  describe("contrato vigente — sem tail aprovado até hoje", () => {
    it("mensal: após abril fechado, com devolução em Junho e hoje em 11/05: só rascunho 01/05–30/05 (sem 01/05–11/05 aprovado)", () => {
      const rows = simulateNonDailyPeriodicClosures(
        {
          pickupScheduled: d(2026, 4, 1),
          rentalType: "monthly",
          lastBillingDate: d(2026, 4, 30),
          nextBillingDate: d(2026, 5, 30),
          returnScheduled: d(2026, 6, 30),
        },
        d(2026, 5, 11),
      );
      const approved = rows.filter((r) => r.kind === "approved");
      const draft = rows.filter((r) => r.kind === "draft");
      expect(approved).toHaveLength(0);
      expect(draft).toHaveLength(1);
      expect(formatYmdLocal(draft[0].periodStart)).toBe("2026-05-01");
      expect(formatYmdLocal(draft[0].periodEnd)).toBe("2026-05-30");
    });
  });

  describe("retroactive + devolução prevista — teto dos rascunhos", () => {
    it("não gera rascunho com início após returnScheduled mesmo com cobrança em aberto (retroactive)", () => {
      const rows = simulateNonDailyPeriodicClosures(
        {
          pickupScheduled: d(2026, 4, 1),
          rentalType: "monthly",
          lastBillingDate: d(2026, 4, 30),
          retroactiveOpenBilling: true,
          returnScheduled: d(2026, 5, 11),
        },
        d(2026, 5, 12),
      );
      expect(rows.filter((r) => r.kind === "draft")).toHaveLength(0);
      const approved = rows.filter((r) => r.kind === "approved");
      expect(approved.length).toBeGreaterThanOrEqual(1);
    });
  });
});
