import React from "react";
import type { ColumnSort, SortDirection } from "../utils/tableSort";

type Props<K extends string> = {
  columnKey: K;
  label: React.ReactNode;
  sort: ColumnSort<K> | null;
  onSort: (key: K) => void;
  align?: "left" | "right" | "center";
  scope?: React.ThHTMLAttributes<HTMLTableCellElement>["scope"];
  /** Classes do <th> (exceto alinhamento) */
  thClassName?: string;
};

/** Cabeçalho de coluna clicável: alterna ascendente ↔ descendente. */
export default function SortableTh<K extends string>({
  columnKey,
  label,
  sort,
  onSort,
  align = "left",
  scope = "col",
  thClassName = "px-4 py-3 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase whitespace-nowrap",
}: Props<K>) {
  const active = sort?.key === columnKey;
  const dir: SortDirection | null = active ? sort!.dir : null;
  const ariaSort =
    !active ? "none" : dir === "asc" ? ("ascending" as const) : ("descending" as const);
  const alignClass =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";

  return (
    <th aria-sort={ariaSort} scope={scope} className={`${thClassName} ${alignClass}`}>
      <button
        type="button"
        aria-label={`Ordenar por ${typeof label === "string" ? label : String(columnKey)}`}
        className={`inline-flex items-center gap-1 max-w-full font-inherit text-inherit bg-transparent border-0 p-0 cursor-pointer hover:underline select-none ${align === "right" ? "flex-row-reverse" : ""}`}
        onClick={() => onSort(columnKey)}
      >
        <span>{label}</span>
        <span
          className="text-[10px] text-gray-500 dark:text-gray-400 shrink-0"
          aria-hidden
        >
          {dir === "asc" ? "▲" : dir === "desc" ? "▼" : "⇅"}
        </span>
      </button>
    </th>
  );
}
