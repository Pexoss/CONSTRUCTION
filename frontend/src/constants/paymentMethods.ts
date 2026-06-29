export const PAYMENT_METHODS = [
  { value: "manual", label: "Em dinheiro" },
  { value: "pix", label: "PIX" },
  { value: "boleto", label: "Boleto" },
  { value: "cartao", label: "Cartão" },
  { value: "transferencia", label: "Transferência" },
  { value: "cheque", label: "Cheque" },
] as const;

export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number]["value"];

export const DEFAULT_PAYMENT_METHOD: PaymentMethodValue = "manual";
export const DEFAULT_INVOICE_PAYMENT_METHOD: PaymentMethodValue = "pix";

const PAYMENT_METHOD_VALUE_SET = new Set<string>(
  PAYMENT_METHODS.map((m) => m.value),
);

/** Normaliza valores legados (ex.: boleto/PIX, Transferência) para o slug padrão. */
export function normalizePaymentMethodValue(
  value?: string | null,
): PaymentMethodValue | "" {
  const raw = (value ?? "").trim();
  if (!raw) return "";

  const folded = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

  if (PAYMENT_METHOD_VALUE_SET.has(folded)) {
    return folded as PaymentMethodValue;
  }

  if (folded === "boleto/pix" || folded === "boleto pix") {
    return "pix";
  }

  const byLabel = PAYMENT_METHODS.find(
    (m) =>
      m.label
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{M}/gu, "") === folded,
  );
  return byLabel?.value ?? "";
}

export function formatPaymentMethodLabel(value?: string | null): string {
  const normalized = normalizePaymentMethodValue(value);
  if (normalized) {
    return PAYMENT_METHODS.find((m) => m.value === normalized)!.label;
  }
  const raw = (value ?? "").trim();
  return raw || "—";
}

export function paymentMethodSelectValue(
  value?: string | null,
  fallback: PaymentMethodValue = DEFAULT_PAYMENT_METHOD,
): PaymentMethodValue {
  return normalizePaymentMethodValue(value) || fallback;
}
