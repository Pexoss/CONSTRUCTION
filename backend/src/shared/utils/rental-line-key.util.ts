/** Chave canônica de linha no contrato (alinhada aos fechamentos). */

export function asIdString(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value?._id) {
    const nested = value._id;
    if (typeof nested === "string") return nested;
    if (nested?.toString) return nested.toString();
  }
  if (value?.toString) return value.toString();
  return String(value);
}

function normalizeDateKeyForRentalLine(value?: Date | string | null): string {
  if (value === undefined || value === null || value === "") return "na";
  const d = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(d.getTime())) return "na";
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

/**
 * Identifica unicamente cada segmento contratual após devoluções parciais.
 * `lineId` opcional compatível retroativamente.
 */
export function buildRentalLineKey(item: {
  itemId?: any;
  unitId?: string;
  rentalType?: string;
  pickupScheduled?: Date | string | null;
  returnScheduled?: Date | string | null;
  lineId?: string | null;
}): string {
  const itemId = asIdString(item?.itemId) || "na";
  const unitId = item?.unitId ? String(item.unitId) : "no-unit";
  const rentalType = String(item?.rentalType || "daily");
  const pickup = normalizeDateKeyForRentalLine(item?.pickupScheduled);
  const ret = normalizeDateKeyForRentalLine(item?.returnScheduled);
  const lineId =
    typeof item?.lineId === "string" && item.lineId.trim().length > 0
      ? item.lineId.trim()
      : "";
  if (lineId) {
    return `${itemId}|${unitId}|${rentalType}|${pickup}|${ret}|${lineId}`;
  }
  return `${itemId}|${unitId}|${rentalType}|${pickup}|${ret}`;
}
