/**
 * Formata data civil (ISO UTC ou YYYY-MM-DD) sem deslocar o dia por fuso.
 * Ex.: 2026-04-01T00:00:00.000Z → 01/04/2026
 */
export function formatDateBrNoTimezoneShift(
  value?: string | Date | null,
): string {
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
}

/** Converte YYYY-MM-DD (ou ISO) em Date local à meia-noite civil. */
export function parseCalendarDate(
  value?: string | Date | null,
): Date | undefined {
  if (value === undefined || value === null) return undefined;
  if (value instanceof Date) return value;
  const s = String(value).trim();
  if (!s) return undefined;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (dateOnly) {
    return new Date(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3]),
    );
  }
  const ymdFromIso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymdFromIso) {
    return new Date(
      Number(ymdFromIso[1]),
      Number(ymdFromIso[2]) - 1,
      Number(ymdFromIso[3]),
    );
  }
  return new Date(s);
}
