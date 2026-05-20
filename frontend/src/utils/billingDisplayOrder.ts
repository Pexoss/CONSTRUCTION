import type { Billing, BillingItem, BillingService } from "../types/billing.types";

const FRETE_REGEX = /\bfrete\b/i;

export function isBillingFreteLine(
  description: string | undefined | null,
  category?: string | null,
): boolean {
  const cat = String(category ?? "").trim().toLowerCase();
  if (cat === "frete") return true;
  const d = String(description ?? "").trim().toLowerCase();
  if (d === "frete") return true;
  if (FRETE_REGEX.test(String(description ?? ""))) return true;
  if (d.includes("frete")) return true;
  return false;
}

export function sortBillingRowsFreteLastStable<T>(
  rows: readonly T[],
  isFrete: (row: T) => boolean,
): T[] {
  return [...rows]
    .map((row, index) => ({ row, index }))
    .sort(
      (a, b) =>
        Number(isFrete(a.row)) - Number(isFrete(b.row)) || a.index - b.index,
    )
    .map(({ row }) => row);
}

export type BillingCompositionRowUi =
  | { kind: "item"; item: BillingItem }
  | { kind: "service"; service: BillingService };

export function getBillingCompositionRowsOrdered(
  billing: { items?: BillingItem[] | null; services?: BillingService[] | null },
  getItemDisplayName: (item: BillingItem) => string,
): BillingCompositionRowUi[] {
  const raw: BillingCompositionRowUi[] = [
    ...(billing.items ?? []).map((item) => ({ kind: "item" as const, item })),
    ...(billing.services ?? []).map((service) => ({ kind: "service" as const, service })),
  ];
  return sortBillingRowsFreteLastStable(raw, (row) =>
    row.kind === "item"
      ? isBillingFreteLine(getItemDisplayName(row.item))
      : isBillingFreteLine(row.service.description, row.service.category),
  );
}

export function billingDocumentTimelineMs(billing: {
  billingDate?: string | null;
  periodStart?: string | null;
}): number {
  if (billing.billingDate != null && billing.billingDate !== "") {
    const t = new Date(billing.billingDate).getTime();
    if (Number.isFinite(t)) return t;
  }
  if (billing.periodStart != null && billing.periodStart !== "") {
    const t = new Date(billing.periodStart).getTime();
    if (Number.isFinite(t)) return t;
  }
  return 0;
}

export function billingDocumentContainsFrete(
  billing: { items?: BillingItem[] | null; services?: BillingService[] | null },
  getItemDisplayName: (item: BillingItem) => string,
): boolean {
  for (const line of billing.items ?? []) {
    if (isBillingFreteLine(getItemDisplayName(line))) return true;
  }
  for (const svc of billing.services ?? []) {
    if (isBillingFreteLine(svc.description, svc.category)) return true;
  }
  return false;
}

/** Fechamentos com frete depois dos sem frete (por data/período dentro de cada faixa). */
export function sortBillingDocumentsFreteClosureGroupLastStable<B extends Billing>(
  billings: readonly B[],
  getItemDisplayName: (item: BillingItem) => string,
): B[] {
  return [...billings]
    .map((b, originalIndex) => ({
      b,
      originalIndex,
      hasFrete: billingDocumentContainsFrete(b, getItemDisplayName),
      timeline: billingDocumentTimelineMs(b),
    }))
    .sort((a, b) => {
      if (a.hasFrete !== b.hasFrete) {
        return Number(a.hasFrete) - Number(b.hasFrete);
      }
      if (a.timeline !== b.timeline) {
        return a.timeline - b.timeline;
      }
      return a.originalIndex - b.originalIndex;
    })
    .map(({ b }) => b);
}
