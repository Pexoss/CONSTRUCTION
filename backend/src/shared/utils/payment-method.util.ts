const PAYMENT_METHOD_LABELS: Record<string, string> = {
  manual: "Em dinheiro",
  pix: "PIX",
  boleto: "Boleto",
  cartao: "Cartão",
  transferencia: "Transferência",
  cheque: "Cheque",
};

function foldPaymentMethodKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function normalizePaymentMethodValue(value?: string | null): string {
  const raw = (value ?? "").trim();
  if (!raw) return "pix";

  const folded = foldPaymentMethodKey(raw);
  if (PAYMENT_METHOD_LABELS[folded]) {
    return folded;
  }
  if (folded === "boleto/pix" || folded === "boleto pix") {
    return "pix";
  }

  for (const [slug, label] of Object.entries(PAYMENT_METHOD_LABELS)) {
    if (foldPaymentMethodKey(label) === folded) {
      return slug;
    }
  }

  return folded;
}

export function formatPaymentMethodLabel(value?: string | null): string {
  const raw = (value ?? "").trim();
  if (!raw) return PAYMENT_METHOD_LABELS.pix;

  const normalized = normalizePaymentMethodValue(raw);
  return PAYMENT_METHOD_LABELS[normalized] ?? raw;
}
