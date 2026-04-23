const onlyDigits = (value: string): string => value.replace(/\D/g, "");

const isAllDigits = (value: string): boolean => /^\d+$/.test(value);

const isValidCpf = (digits: string): boolean => {
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

const isValidCnpj = (digits: string): boolean => {
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

export const formatDocumentForDisplay = (value?: string | null): string => {
  const raw = (value || "").trim();
  if (!raw) return "";
  if (!isAllDigits(raw)) return raw;

  const digits = onlyDigits(raw);
  if (digits.length === 11 && isValidCpf(digits)) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (digits.length === 14 && isValidCnpj(digits)) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return raw;
};

export const formatPhoneForDisplay = (value?: string | null): string => {
  const raw = (value || "").trim();
  if (!raw) return "";
  if (!isAllDigits(raw)) return raw;

  const digits = onlyDigits(raw);
  if (digits.length === 11) {
    return digits.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  }
  if (digits.length === 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  }
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
