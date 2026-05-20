const brMoneyNumberFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const brCurrencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** Formata número como moeda sem símbolo: 1.234,56 */
export function formatMoneyBr(
  value: number | string | null | undefined,
): string {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return brMoneyNumberFormatter.format(0);
  return brMoneyNumberFormatter.format(num);
}

/** Formata número como moeda brasileira: R$ 1.234,56 */
export function formatCurrencyBr(
  value: number | string | null | undefined,
): string {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return brCurrencyFormatter.format(0);
  return brCurrencyFormatter.format(num);
}
