"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { Skeleton } from "./skeleton";
import { EmptyState, ErrorState } from "./empty-state";
import type { LucideIcon } from "lucide-react";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Value used for sorting; omit to make the column unsortable. */
  sortValue?: (row: T) => string | number | null | undefined;
  align?: "left" | "right" | "center";
  className?: string;
  /** Hide on narrow screens. */
  hideBelow?: "sm" | "md" | "lg";
}

interface DataTableProps<T> {
  rows: T[] | undefined;
  columns: Column<T>[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  empty?: { icon?: LucideIcon; title: string; description?: ReactNode; action?: ReactNode };
  pageSize?: number;
  onRowClick?: (row: T) => void;
  initialSort?: { key: string; dir: "asc" | "desc" };
  footer?: ReactNode;
}

const hide = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" };

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  loading,
  error,
  onRetry,
  empty,
  pageSize = 15,
  onRowClick,
  initialSort,
  footer,
}: DataTableProps<T>) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const list = rows ?? [];
    if (!sort) return list;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return list;
    const get = col.sortValue;
    return [...list].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "en", { numeric: true });
      return sort.dir === "asc" ? r : -r;
    });
  }, [rows, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages - 1);
  const slice = sorted.slice(current * pageSize, current * pageSize + pageSize);

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key === key ? (s.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" }));

  // Phones get stacked cards: first column as the title, an untitled column (row actions) top-right,
  // the rest as label / value pairs. Tables from 640px up.
  const [titleCol, ...restCols] = columns;
  const actionCols = restCols.filter((c) => !c.header);
  const detailCols = restCols.filter((c) => c.header);
  const sortable = columns.filter((c) => c.sortValue);

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-card">
      <div className="sm:hidden">
        {sortable.length > 1 && !loading && !error && slice.length > 1 && (
          <div className="flex items-center justify-end gap-2 border-b border-line bg-surface-muted px-4 py-2 text-xs text-ink-subtle">
            <label htmlFor={`sort-${sortable.map((c) => c.key).join("-")}`}>Sort by</label>
            <select
              id={`sort-${sortable.map((c) => c.key).join("-")}`}
              value={sort ? `${sort.key}:${sort.dir}` : ""}
              onChange={(e) => {
                const [key, dir] = e.target.value.split(":");
                setSort(key ? { key, dir: dir as "asc" | "desc" } : null);
              }}
              className="rounded-lg border border-line bg-surface px-2 py-1 text-xs font-medium text-ink"
            >
              <option value="">Default</option>
              {sortable.flatMap((c) => [
                <option key={`${c.key}:asc`} value={`${c.key}:asc`}>
                  {c.header || c.key} ↑
                </option>,
                <option key={`${c.key}:desc`} value={`${c.key}:desc`}>
                  {c.header || c.key} ↓
                </option>,
              ])}
            </select>
          </div>
        )}
        {loading ? (
          <div className="space-y-3 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : error ? (
          <ErrorState onRetry={onRetry} />
        ) : slice.length === 0 ? (
          <EmptyState icon={empty?.icon} title={empty?.title ?? "Nothing here yet"} description={empty?.description} action={empty?.action} />
        ) : (
          <ul className="divide-y divide-line">
            {slice.map((row) => (
              <li
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn("space-y-2 px-4 py-3.5", onRowClick && "cursor-pointer active:bg-brand-softer")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 text-sm text-ink [&_.w-40]:w-auto [&_.w-44]:w-auto [&_.w-48]:w-auto">{titleCol?.cell(row)}</div>
                  {actionCols.map((c) => (
                    <div key={c.key} className="shrink-0">
                      {c.cell(row)}
                    </div>
                  ))}
                </div>
                {detailCols.length > 0 && (
                  <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5 text-[13px]">
                    {detailCols.map((c) => (
                      <div key={c.key} className="contents">
                        <dt className="text-xs text-ink-subtle">{c.header}</dt>
                        <dd className="min-w-0 justify-self-end text-right text-ink [&_.w-28]:w-24">{c.cell(row)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-muted">
              {columns.map((c) => {
                const active = sort?.key === c.key;
                const Icon = !active ? ArrowUpDown : sort!.dir === "asc" ? ArrowUp : ArrowDown;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                    className={cn(
                      "whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-ink-subtle",
                      c.align === "right" && "text-right",
                      c.align === "center" && "text-center",
                      c.hideBelow && hide[c.hideBelow],
                    )}
                  >
                    {c.sortValue ? (
                      <button onClick={() => toggleSort(c.key)} className={cn("inline-flex items-center gap-1 hover:text-ink", active && "text-ink")}>
                        {c.header}
                        <Icon className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  {columns.map((c) => (
                    <td key={c.key} className={cn("px-4 py-3.5", c.hideBelow && hide[c.hideBelow])}>
                      <Skeleton className="h-4 w-full max-w-[140px]" />
                    </td>
                  ))}
                </tr>
              ))
            ) : error ? (
              <tr>
                <td colSpan={columns.length}>
                  <ErrorState onRetry={onRetry} />
                </td>
              </tr>
            ) : slice.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <EmptyState icon={empty?.icon} title={empty?.title ?? "Nothing here yet"} description={empty?.description} action={empty?.action} />
                </td>
              </tr>
            ) : (
              slice.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn("border-b border-line last:border-0", onRowClick && "cursor-pointer hover:bg-brand-softer")}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        "px-4 py-3 align-middle text-ink",
                        c.align === "right" && "text-right tabular",
                        c.align === "center" && "text-center",
                        c.hideBelow && hide[c.hideBelow],
                        c.className,
                      )}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {footer && !loading && !error && slice.length > 0 && <tfoot>{footer}</tfoot>}
        </table>
      </div>
      {!loading && sorted.length > pageSize && (
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-[13px] text-ink-muted">
          <span className="tabular">
            {current * pageSize + 1}–{Math.min(sorted.length, (current + 1) * pageSize)} of {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(current - 1)}
              disabled={current === 0}
              className="grid h-8 w-8 place-items-center rounded-lg border border-line hover:bg-surface-muted disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 tabular">
              Page {current + 1} of {pages}
            </span>
            <button
              onClick={() => setPage(current + 1)}
              disabled={current >= pages - 1}
              className="grid h-8 w-8 place-items-center rounded-lg border border-line hover:bg-surface-muted disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
