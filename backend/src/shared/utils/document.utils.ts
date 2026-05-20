export const normalizeDocument = (value?: string | null): string =>
  String(value || "").replace(/\D/g, "");

export const isValidCpf = (value?: string | null): boolean => {
  const digits = normalizeDocument(value);
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

export const isValidCnpj = (value?: string | null): boolean => {
  const digits = normalizeDocument(value);
  if (!/^\d{14}$/.test(digits) || /^(\d)\1{13}$/.test(digits)) return false;

  const calcCheckDigit = (base: string, weights: number[]): number => {
    const sum = base
      .split("")
      .reduce((acc, curr, index) => acc + Number(curr) * weights[index], 0);
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const firstDigit = calcCheckDigit(
    digits.slice(0, 12),
    [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  const secondDigit = calcCheckDigit(
    digits.slice(0, 12) + firstDigit,
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );

  return digits.endsWith(`${firstDigit}${secondDigit}`);
};

export const isValidCpfCnpj = (value?: string | null): boolean => {
  const digits = normalizeDocument(value);
  if (digits.length === 11) return isValidCpf(digits);
  if (digits.length === 14) return isValidCnpj(digits);
  return false;
};

/** CNPJ com 14 dígitos apenas; retorna string vazia se inválido. */
export const formatCnpjForDisplay = (digitsRaw?: string | null): string => {
  const d = normalizeDocument(digitsRaw);
  if (d.length !== 14) return String(digitsRaw || "").trim();
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
};

