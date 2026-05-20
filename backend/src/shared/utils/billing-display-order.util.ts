const FRETE_REGEX = /\bfrete\b/i;

/** Identifica linha de frete em serviços (categoria e/ou texto). */
export function isBillingFreteLine(
  description: string | undefined | null,
  category?: string | null,
): boolean {
  const cat = String(category ?? "").trim().toLowerCase();
  if (cat === "frete") return true;
  const d = String(description ?? "").trim().toLowerCase();
  if (d === "frete") return true;
  if (FRETE_REGEX.test(String(description ?? ""))) return true;
  /* PDF/fatura só têm texto — captura compostos onde \b pode falhar (ex.: "TaxaFRETE"). */
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

export type BillingCompositionRow<ItemLine, ServiceLine> =
  | { kind: "item"; line: ItemLine }
  | { kind: "service"; svc: ServiceLine };

/**
 * Ordem de exibição/fechamento/fatura: equipamentos e serviços preservando ordem original,
 * com qualquer linha de frete sempre ao final.
 */
export function getBillingCompositionRowsOrdered<ItemLine, ServiceLine extends { description?: string; category?: string }>(
  billing: { items?: ItemLine[] | null; services?: ServiceLine[] | null },
  getItemDisplayName: (line: ItemLine) => string,
): BillingCompositionRow<ItemLine, ServiceLine>[] {
  const raw: BillingCompositionRow<ItemLine, ServiceLine>[] = [
    ...(billing.items ?? []).map((line) => ({ kind: "item" as const, line })),
    ...(billing.services ?? []).map((svc) => ({ kind: "service" as const, svc })),
  ];
  return sortBillingRowsFreteLastStable(raw, (row) =>
    row.kind === "item"
      ? isBillingFreteLine(getItemDisplayName(row.line))
      : isBillingFreteLine(row.svc.description, row.svc.category),
  );
}

export function billingDocumentTimelineMs(billing: {
  billingDate?: Date | string | null;
  periodStart?: Date | string | null;
}): number {
  if (billing.billingDate != null) {
    const t = new Date(billing.billingDate as Date | string).getTime();
    if (Number.isFinite(t)) return t;
  }
  if (billing.periodStart != null) {
    const t = new Date(billing.periodStart as Date | string).getTime();
    if (Number.isFinite(t)) return t;
  }
  return 0;
}

/** Fechamento contém linha de frete (equipamento ou serviço). */
export function billingDocumentContainsFrete(
  billing: { items?: unknown[] | null; services?: Array<{ description?: string; category?: string }> | null },
  getItemDisplayName: (line: unknown) => string,
): boolean {
  for (const line of billing.items ?? []) {
    if (isBillingFreteLine(getItemDisplayName(line))) return true;
  }
  for (const svc of billing.services ?? []) {
    if (isBillingFreteLine(svc?.description, svc?.category)) return true;
  }
  return false;
}

/**
 * Fechamentos com frete ficam depois dos sem frete; dentro de cada faixa, ordem por data (billingDate / início do período).
 */
export function sortBillingDocumentsFreteClosureGroupLastStable<T extends { _id?: unknown }>(
  billings: readonly T[],
  getItemDisplayName: (line: unknown) => string,
): T[] {
  return [...billings]
    .map((b, originalIndex) => ({
      b,
      originalIndex,
      hasFrete: billingDocumentContainsFrete(b as any, getItemDisplayName),
      timeline: billingDocumentTimelineMs(b as any),
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
