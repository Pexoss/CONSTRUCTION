const onlyDigits = (value: string): string => value.replace(/\D/g, "");

/** Remove tudo que não for dígito. */
export const normalizeDigits = (value: string): string => onlyDigits(value);

/** Máscara CPF/CNPJ enquanto digita (adapta ao tamanho). */
export const formatDocumentInputBr = (value: string): string => {
  const digits = onlyDigits(value).slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
  }
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
};

/** Máscara telefone BR enquanto digita (10 ou 11 dígitos). */
export const formatPhoneInputBr = (value: string): string => {
  const digits = onlyDigits(value).slice(0, 11);
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

export const isValidCpf = (digits: string): boolean => {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    sum += Number(digits[i]) * (10 - i);
  }
  let check = (sum * 10) % 11;
  if (check === 10) check = 0;
  if (check !== Number(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i += 1) {
    sum += Number(digits[i]) * (11 - i);
  }
  check = (sum * 10) % 11;
  if (check === 10) check = 0;
  return check === Number(digits[10]);
};

export const isValidCnpj = (digits: string): boolean => {
  if (!/^\d{14}$/.test(digits) || /^(\d)\1{13}$/.test(digits)) return false;

  const calcCheckDigit = (base: string, weights: number[]): number => {
    const sum = base
      .split("")
      .reduce((acc, curr, i) => acc + Number(curr) * weights[i], 0);
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const d1 = calcCheckDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calcCheckDigit(digits.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digits.endsWith(`${d1}${d2}`);
};

export const isValidCpfCnpj = (value?: string | null): boolean => {
  const digits = onlyDigits(value || "");
  if (digits.length === 11) return isValidCpf(digits);
  if (digits.length === 14) return isValidCnpj(digits);
  return false;
};

export const formatDocumentForDisplay = (value?: string | null): string => {
  const raw = (value || "").trim();
  if (!raw) return "";
  const digits = onlyDigits(raw);
  if (!digits) return raw;
  if (digits.length <= 14) return formatDocumentInputBr(digits);
  return raw;
};

export const formatPhoneForDisplay = (value?: string | null): string => {
  const raw = (value || "").trim();
  if (!raw) return "";
  const digits = onlyDigits(raw);
  if (!digits) return raw;
  if (digits.length <= 11) return formatPhoneInputBr(digits);
  return raw;
};

/**
 * Formata datas ISO UTC (ex: 2026-04-01T00:00:00.000Z) sem deslocar por fuso.
 * Evita mostrar "um dia a menos" na UI.
 */
export const formatDateNoTimezoneShift = (
  value?: string | Date | null,
): string => {
  if (!value) return "";
  const str = value instanceof Date ? value.toISOString() : String(value);
  const ymd = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) {
    return `${ymd[3]}/${ymd[2]}/${ymd[1]}`;
  }
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return "";
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
};

export const formatDateTimeForDisplay = (
  value?: string | Date | null,
): string => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
};

export const toDateInputValue = (value?: string | Date | null): string => {
  if (!value) return "";
  const str = value instanceof Date ? value.toISOString() : String(value);
  const ymd = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return ymd ? `${ymd[1]}-${ymd[2]}-${ymd[3]}` : "";
};

export const todayDateInputValue = (): string => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const getBillingOutstandingAmount = (billing: {
  outstandingAmount?: number | null;
  calculation?: { total?: number | null } | null;
}): number => Number(billing?.outstandingAmount ?? billing?.calculation?.total ?? 0);

const brMoneyNumberFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const brCurrencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** Converte texto monetário pt-BR (ex.: 1.234,56) ou en-US (1234.56) em número. */
export const parseMoneyBr = (
  value: string | number | null | undefined,
): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return 0;
  let normalized = trimmed.replace(/\s/g, "").replace(/^R\$\s?/i, "");
  if (normalized.includes(",")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (normalized.includes(".")) {
    const lastDot = normalized.lastIndexOf(".");
    const afterDot = normalized.slice(lastDot + 1);
    const dotCount = (normalized.match(/\./g) || []).length;
    const looksLikeDecimal =
      dotCount === 1 && /^\d{1,2}$/.test(afterDot);
    if (!looksLikeDecimal) {
      normalized = normalized.replace(/\./g, "");
    }
  }
  const num = Number(normalized);
  return Number.isFinite(num) ? num : NaN;
};

/** Formata número como moeda sem símbolo: 1.234,56 */
export const formatMoneyBr = (
  value: number | string | null | undefined,
): string => {
  const num =
    typeof value === "string" ? parseMoneyBr(value) : Number(value ?? 0);
  if (!Number.isFinite(num)) return brMoneyNumberFormatter.format(0);
  return brMoneyNumberFormatter.format(num);
};

/** Formata número como moeda brasileira: R$ 1.234,56 */
export const formatCurrencyBr = (
  value: number | string | null | undefined,
): string => {
  const num =
    typeof value === "string" ? parseMoneyBr(value) : Number(value ?? 0);
  if (!Number.isFinite(num)) return brCurrencyFormatter.format(0);
  return brCurrencyFormatter.format(num);
};

/** Normaliza valor para inputs monetários editáveis (sempre 2 casas, vírgula decimal). */
export const formatMoneyInputBr = (
  value: number | string | null | undefined,
): string => {
  if (value === "" || value === null || value === undefined) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const num = parseMoneyBr(trimmed);
    if (!Number.isFinite(num)) return trimmed;
    return formatMoneyBr(num);
  }
  if (!Number.isFinite(value)) return "";
  return formatMoneyBr(value);
};

/**
 * Máscara monetária em tempo real para inputs (pt-BR).
 * - Pontos na tela são só milhar; vírgula (ou ponto digitado antes dos centavos) inicia decimais.
 * - `1760` -> `1.760`; ao continuar `17605` -> `17.605`
 * - `1760,5` -> `1.760,5` — `,00` completo no blur via formatMoneyInputBr
 */
export const formatMoneyInputBrLive = (rawValue: string): string => {
  const raw = String(rawValue ?? "");
  if (!raw.trim()) return "";

  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  let decimalIndex = -1;

  if (lastComma >= 0) {
    decimalIndex = lastComma;
  } else if (lastDot >= 0) {
    const afterDot = raw.slice(lastDot + 1).replace(/\D/g, "");
    // Ponto só é decimal se houver até 2 dígitos depois (evita confundir com 1.760).
    if (afterDot.length <= 2) {
      decimalIndex = lastDot;
    }
  }

  const hasDecimalSeparator = decimalIndex >= 0;

  let intDigits: string;
  let fracDigits: string;

  if (hasDecimalSeparator) {
    intDigits = raw.slice(0, decimalIndex).replace(/\D/g, "");
    fracDigits = raw
      .slice(decimalIndex + 1)
      .replace(/\D/g, "")
      .slice(0, 2);
  } else {
    intDigits = raw.replace(/\D/g, "");
    fracDigits = "";
  }

  if (!intDigits && !fracDigits) {
    return hasDecimalSeparator ? "," : "";
  }

  const intFormatted = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(intDigits || "0"));

  if (!hasDecimalSeparator) {
    return intFormatted;
  }

  if (!fracDigits) {
    return intDigits ? `${intFormatted},` : ",";
  }

  return `${intFormatted},${fracDigits}`;
};

export const formatRentalTypeLabel = (value?: string | null): string => {
  const key = (value || "").toLowerCase();
  const labels: Record<string, string> = {
    daily: "Diário",
    weekly: "Semanal",
    biweekly: "Quinzenal",
    monthly: "Mensal",
    diario: "Diário",
    semanal: "Semanal",
    quinzenal: "Quinzenal",
    mensal: "Mensal",
  };
  return labels[key] || value || "-";
};
