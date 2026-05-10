/** Ordenação de linhas para tabelas com cabeçalhos clicáveis (pt-BR). */

export type SortDirection = "asc" | "desc";

export type ColumnSort<K extends string = string> = {
  key: K;
  dir: SortDirection;
};

export type SortablePrimitive = string | number | bigint | Date | null | undefined;

export function toggleColumnSort<K extends string>(
  current: ColumnSort<K> | null,
  column: K,
): ColumnSort<K> {
  if (!current || current.key !== column) {
    return { key: column, dir: "asc" };
  }
  return { key: column, dir: current.dir === "asc" ? "desc" : "asc" };
}

function sortKey(val: SortablePrimitive): string | number {
  if (val == null) {
    return "";
  }
  if (val instanceof Date) {
    return val.getTime();
  }
  if (typeof val === "number") {
    return Number.isFinite(val) ? val : "";
  }
  if (typeof val === "bigint") {
    return Number(val);
  }
  return String(val);
}

/** Compara dois valores vindos dos acessadores (string/number/Date/null). */
export function compareCells(a: SortablePrimitive, b: SortablePrimitive): number {
  const va = sortKey(a);
  const vb = sortKey(b);
  if (typeof va === "number" && typeof vb === "number") {
    const diff = va - vb;
    if (diff !== 0) {
      return diff;
    }
    return 0;
  }
  return String(va).localeCompare(String(vb), "pt-BR", {
    numeric: true,
    sensitivity: "base",
  });
}

/** Ordena uma cópia de `rows` conforme `sort`; se `sort` for null mantém ordem atual. */
export function sortedTableRows<T, K extends string>(
  rows: T[],
  sort: ColumnSort<K> | null,
  accessors: Record<K, (row: T) => SortablePrimitive>,
): T[] {
  if (!sort || rows.length === 0) {
    return rows;
  }
  const pick = accessors[sort.key];
  if (!pick) {
    return rows;
  }
  const mul = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => mul * compareCells(pick(a), pick(b)));
}
