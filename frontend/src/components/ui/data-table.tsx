"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Search,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { downloadCsv, type CsvCell } from "@/lib/csv";
import { today } from "@/lib/dates";
import { Skeleton } from "./skeleton";
import { EmptyState, ErrorState } from "./empty-state";
import type { LucideIcon } from "lucide-react";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T, index?: number) => ReactNode;
  /** Value used for sorting; omit to make the column unsortable. */
  sortValue?: (row: T) => string | number | null | undefined;
  /** Value written to the export file (defaults to sortValue). Columns with neither are left out. */
  exportValue?: (row: T) => CsvCell;
  /** Text matched by the built-in search (defaults to exportValue, then sortValue). */
  searchValue?: (row: T) => string | null | undefined;
  /** Header text for the export file when the header isn't plain text. */
  exportHeader?: string;
  align?: "left" | "right" | "center";
  className?: string;
  headerClassName?: string;
  /** Hide on narrow screens. */
  hideBelow?: "sm" | "md" | "lg";
}

export interface DataTableFilterTab {
  key: string;
  label: string;
  count?: number;
}

export interface DataTableProps<T> {
  rows: T[] | undefined;
  columns: Column<T>[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  empty?: { icon?: LucideIcon; title: string; description?: ReactNode; action?: ReactNode };
  pageSize?: number;
  pageSizeOptions?: number[];
  onRowClick?: (row: T) => void;
  /** Accessible name for a clickable row, e.g. "Open INV/2026-27/0001". */
  rowLabel?: (row: T) => string;
  /** Built-in Export (CSV of every row as filtered and sorted). File name without extension; false = no button. */
  exportName?: string | false;
  initialSort?: { key: string; dir: "asc" | "desc" };
  footer?: ReactNode;
  className?: string;

  /** Enable row selection checkboxes */
  selectable?: boolean;
  selectedKeys?: Set<string>;
  onSelectionChange?: (selected: Set<string>) => void;

  /** Built-in or controlled search bar */
  searchable?: boolean;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (val: string) => void;

  /** Extra buttons / controls rendered on the right side of the toolbar (e.g. Filter, Export) */
  toolbarActions?: ReactNode;

  /** Filter tabs (e.g. All [1829], Open [31], In Progress [123]) */
  filterTabs?: DataTableFilterTab[];
  activeFilterTab?: string;
  onFilterTabChange?: (key: string) => void;

  /** Custom noun for row count (e.g. "tickets", "enrollments", "clients"). Default: "row(s)" */
  itemsLabel?: string;

  /** Formatted timestamp displayed in footer (e.g. "Oct 14, 2026 12:50:54 PM") */
  lastUpdated?: string | Date;
}

const hide = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
};

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  loading,
  error,
  onRetry,
  empty,
  pageSize: initialPageSize = 10,
  pageSizeOptions = [10, 25, 50, 100],
  onRowClick,
  rowLabel,
  exportName = "export",
  initialSort,
  footer,
  className,
  selectable = false,
  selectedKeys: controlledSelectedKeys,
  onSelectionChange,
  searchable,
  searchPlaceholder = "Search...",
  searchValue: controlledSearchValue,
  onSearchChange,
  toolbarActions,
  filterTabs,
  activeFilterTab,
  onFilterTabChange,
  itemsLabel,
  lastUpdated,
}: DataTableProps<T>) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [internalSearch, setInternalSearch] = useState("");
  const [internalSelectedKeys, setInternalSelectedKeys] = useState<Set<string>>(new Set());

  // Search state (controlled or uncontrolled)
  const isSearchControlled = controlledSearchValue !== undefined;
  const searchTerm = isSearchControlled ? controlledSearchValue : internalSearch;

  // Selection state (controlled or uncontrolled)
  const isSelectionControlled = controlledSelectedKeys !== undefined;
  const currentSelectedKeys = isSelectionControlled ? controlledSelectedKeys : internalSelectedKeys;

  const handleSelectionChange = (newSelected: Set<string>) => {
    if (!isSelectionControlled) {
      setInternalSelectedKeys(newSelected);
    }
    onSelectionChange?.(newSelected);
  };

  // Filter rows by search term if internal search is active and onSearchChange not provided
  const filteredRows = useMemo(() => {
    const list = rows ?? [];
    if (!searchable || isSearchControlled || !searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase();
    return list.filter((row) =>
      columns.some((col) => {
        const val = col.searchValue ? col.searchValue(row) : col.exportValue ? col.exportValue(row) : col.sortValue ? col.sortValue(row) : null;
        if (val != null && String(val).toLowerCase().includes(term)) return true;
        return false;
      })
    );
  }, [rows, searchable, isSearchControlled, searchTerm, columns]);

  // Sort rows
  const sorted = useMemo(() => {
    const list = filteredRows ?? [];
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
      const r =
        typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y), "en", { numeric: true });
      return sort.dir === "asc" ? r : -r;
    });
  }, [filteredRows, sort, columns]);

  const total = sorted.length;
  // Back to page 1 when the page's own filters change the rows (keyed on content — pages often pass a new array each render).
  const signature = `${rows?.length ?? 0}:${rows?.length ? rowKey(rows[0]) : ""}:${rows?.length ? rowKey(rows[rows.length - 1]) : ""}`;
  const [seen, setSeen] = useState(signature);
  if (seen !== signature) {
    setSeen(signature);
    setPage(0);
  }
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pages - 1);
  const slice = sorted.slice(current * pageSize, current * pageSize + pageSize);

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key === key ? (s.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" }));

  // Checkbox selection logic
  const allCurrentPageSelected =
    slice.length > 0 && slice.every((r) => currentSelectedKeys.has(rowKey(r)));
  const someCurrentPageSelected =
    slice.some((r) => currentSelectedKeys.has(rowKey(r))) && !allCurrentPageSelected;

  const toggleSelectAll = () => {
    const next = new Set(currentSelectedKeys);
    if (allCurrentPageSelected) {
      slice.forEach((r) => next.delete(rowKey(r)));
    } else {
      slice.forEach((r) => next.add(rowKey(r)));
    }
    handleSelectionChange(next);
  };

  const toggleSelectRow = (key: string, e: React.MouseEvent | React.ChangeEvent) => {
    e.stopPropagation();
    const next = new Set(currentSelectedKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    handleSelectionChange(next);
  };

  // Stacked mobile card helpers
  const [titleCol, ...restCols] = columns;
  const actionCols = restCols.filter((c) => !c.header);
  const detailCols = restCols.filter((c) => c.header);
  const sortable = columns.filter((c) => c.sortValue);

  const exportCols = columns.filter((c) => (c.exportHeader || typeof c.header === "string") && c.header !== "" && (c.exportValue || c.sortValue));
  const canExport = exportName !== false && exportCols.length > 0 && !loading && !error && total > 0;
  const doExport = () =>
    downloadCsv(
      `${exportName || "export"}-${today()}`,
      exportCols.map((c) => c.exportHeader ?? String(c.header)),
      sorted.map((r) => exportCols.map((c) => (c.exportValue ? c.exportValue(r) : c.sortValue!(r)))),
    );
  const exportButton = canExport ? (
    <button
      type="button"
      onClick={doExport}
      title="Download every row in this view (opens in Excel)"
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-muted"
    >
      <Download className="h-3.5 w-3.5" aria-hidden /> Export
    </button>
  ) : null;
  const actions = toolbarActions || exportButton ? (
    <>
      {toolbarActions}
      {exportButton}
    </>
  ) : null;
  const rowKeys = (row: T) =>
    onRowClick
      ? {
          tabIndex: 0,
          "aria-label": rowLabel?.(row),
          onKeyDown: (e: KeyboardEvent) => {
            if (e.target !== e.currentTarget) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onRowClick(row);
            }
          },
        }
      : {};

  const hasToolbar = Boolean(searchable || actions || filterTabs?.length);

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border border-line/80 bg-surface shadow-sm overflow-hidden",
        className
      )}
    >
      {/* ── Top Toolbar / Filter Tabs & Search Bar ──────────────────────────────── */}
      {hasToolbar && (
        <div className="flex flex-col gap-3 border-b border-line/80 bg-surface px-4 py-3 sm:px-5">
          {/* Status Filter Tabs (e.g. All [1829], Open [31], In Progress [123]) */}
          {filterTabs && filterTabs.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {filterTabs.map((tab) => {
                const isActive = activeFilterTab ? activeFilterTab === tab.key : false;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => onFilterTabChange?.(tab.key)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all",
                      isActive
                        ? "bg-brand text-brand-ink shadow-sm font-semibold"
                        : "bg-surface-muted text-ink-muted hover:bg-line/60 hover:text-ink"
                    )}
                  >
                    <span>{tab.label}</span>
                    {tab.count != null && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.2 text-[11px] font-semibold tabular",
                          isActive
                            ? "bg-white/25 text-white"
                            : "bg-surface text-ink-subtle border border-line/60"
                        )}
                      >
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Search Bar + Custom Actions Row */}
          {(searchable || actions) && (
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              {searchable ? (
                <div className="relative flex-1 max-w-sm">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
                    aria-hidden
                  />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => {
                      if (isSearchControlled) {
                        onSearchChange?.(e.target.value);
                      } else {
                        setInternalSearch(e.target.value);
                      }
                      setPage(0);
                    }}
                    placeholder={searchPlaceholder}
                    aria-label={searchPlaceholder}
                    className="h-9 w-full rounded-lg border border-line bg-surface py-1.5 pl-9 pr-3 text-xs text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </div>
              ) : (
                <div />
              )}

              {actions && <div className="flex items-center gap-2 self-end sm:self-auto">{actions}</div>}
            </div>
          )}
        </div>
      )}

      {/* ── Mobile Stacked Cards View ─────────────────────────────────────────── */}
      <div className="sm:hidden">
        {sortable.length > 1 && !loading && !error && slice.length > 1 && (
          <div className="flex items-center justify-between gap-2 border-b border-line bg-surface-muted px-4 py-2 text-xs text-ink-subtle">
            {selectable && (
              <label className="flex items-center gap-2 cursor-pointer font-medium text-ink">
                <TableCheckbox
                  checked={allCurrentPageSelected}
                  indeterminate={someCurrentPageSelected}
                  onChange={toggleSelectAll}
                  aria-label="Select all rows on this page"
                />
                <span>Select all</span>
              </label>
            )}
            <div className="flex items-center gap-1.5 ml-auto">
              <label htmlFor={`sort-select`} className="text-ink-subtle">
                Sort:
              </label>
              <select
                id="sort-select"
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
                    {typeof c.header === "string" ? c.header : c.key} ↑
                  </option>,
                  <option key={`${c.key}:desc`} value={`${c.key}:desc`}>
                    {typeof c.header === "string" ? c.header : c.key} ↓
                  </option>,
                ])}
              </select>
            </div>
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
          <EmptyState
            icon={empty?.icon}
            title={empty?.title ?? "Nothing here yet"}
            description={empty?.description}
            action={empty?.action}
          />
        ) : (
          <ul className="divide-y divide-line/70">
            {slice.map((row, idx) => {
              const k = rowKey(row);
              const isSelected = currentSelectedKeys.has(k);
              return (
                <li
                  key={k}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  {...rowKeys(row)}
                  className={cn(
                    "space-y-2.5 px-4 py-3.5 transition-colors",
                    isSelected ? "bg-brand-soft/40" : "hover:bg-surface-muted/50",
                    onRowClick && "cursor-pointer active:bg-brand-soft"
                  )}
                >
                  <div className="flex items-start gap-3">
                    {selectable && (
                      <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                        <TableCheckbox
                          checked={isSelected}
                          onChange={(e) => toggleSelectRow(k, e)}
                          aria-label={`Select row ${k}`}
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1 text-sm text-ink font-medium">
                      {titleCol?.cell(row, idx)}
                    </div>
                    {actionCols.map((c) => (
                      <div key={c.key} className="shrink-0" onClick={(e) => e.stopPropagation()}>
                        {c.cell(row, idx)}
                      </div>
                    ))}
                  </div>
                  {detailCols.length > 0 && (
                    <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5 text-xs pl-7">
                      {detailCols.map((c) => (
                        <div key={c.key} className="contents">
                          <dt className="text-ink-subtle">{c.header}</dt>
                          <dd className="min-w-0 justify-self-end text-right text-ink">
                            {c.cell(row, idx)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Desktop & Tablet Table View ───────────────────────────────────────── */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="border-b border-line bg-surface-muted/70">
              {selectable && (
                <th scope="col" className="w-10 px-4 py-3.5 text-center align-middle">
                  <TableCheckbox
                    checked={allCurrentPageSelected}
                    indeterminate={someCurrentPageSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all rows on this page"
                  />
                </th>
              )}
              {columns.map((c) => {
                const active = sort?.key === c.key;
                const Icon = !active ? ArrowUpDown : sort!.dir === "asc" ? ArrowUp : ArrowDown;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={
                      active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined
                    }
                    className={cn(
                      "whitespace-nowrap px-4 py-3.5 text-xs font-semibold text-ink-subtle tracking-normal select-none",
                      c.align === "right" && "text-right",
                      c.align === "center" && "text-center",
                      c.hideBelow && hide[c.hideBelow],
                      c.headerClassName
                    )}
                  >
                    {c.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className={cn(
                          "inline-flex items-center gap-1.5 hover:text-ink transition-colors",
                          active ? "text-ink font-bold" : "text-ink-subtle"
                        )}
                      >
                        <span>{c.header}</span>
                        <Icon
                          className={cn(
                            "h-3.5 w-3.5 transition-colors",
                            active ? "text-brand" : "text-ink-subtle/70"
                          )}
                          aria-hidden
                        />
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-line/60 last:border-0">
                  {selectable && (
                    <td className="px-4 py-3.5 text-center">
                      <Skeleton className="h-4 w-4 rounded mx-auto" />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn("px-4 py-3.5", c.hideBelow && hide[c.hideBelow])}
                    >
                      <Skeleton className="h-4 w-full max-w-[140px]" />
                    </td>
                  ))}
                </tr>
              ))
            ) : error ? (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)}>
                  <ErrorState onRetry={onRetry} />
                </td>
              </tr>
            ) : slice.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)}>
                  <EmptyState
                    icon={empty?.icon}
                    title={empty?.title ?? "Nothing here yet"}
                    description={empty?.description}
                    action={empty?.action}
                  />
                </td>
              </tr>
            ) : (
              slice.map((row, idx) => {
                const k = rowKey(row);
                const isSelected = currentSelectedKeys.has(k);
                return (
                  <tr
                    key={k}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    {...rowKeys(row)}
                    className={cn(
                      "transition-colors focus-visible:bg-brand-soft/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
                      isSelected
                        ? "bg-brand-soft/30 hover:bg-brand-soft/50"
                        : "hover:bg-surface-muted/60",
                      onRowClick && "cursor-pointer"
                    )}
                  >
                    {selectable && (
                      <td
                        className="w-10 px-4 py-3.5 text-center align-middle"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <TableCheckbox
                          checked={isSelected}
                          onChange={(e) => toggleSelectRow(k, e)}
                          aria-label={`Select row ${k}`}
                        />
                      </td>
                    )}
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={cn(
                          "px-4 py-3.5 align-middle text-sm text-ink",
                          c.align === "right" && "text-right tabular",
                          c.align === "center" && "text-center",
                          c.hideBelow && hide[c.hideBelow],
                          c.className
                        )}
                      >
                        {c.cell(row, idx)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
          {footer && !loading && !error && slice.length > 0 && <tfoot>{footer}</tfoot>}
        </table>
      </div>

      {/* ── Table Footer / Pagination (Matching Reference Screenshots) ────────── */}
      {!loading && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/80 bg-surface px-4 py-3 text-xs text-ink-muted">
          {/* Left Side: Row selection count or total count + Optional Timestamp */}
          <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
            <span className="font-medium text-ink-muted tabular">
              {selectable
                ? `${currentSelectedKeys.size} of ${total} row(s) selected.`
                : `${total} ${itemsLabel ?? "records"} total`}
            </span>
            {lastUpdated && (
              <span className="text-[11px] text-ink-subtle">
                Last updated:{" "}
                {typeof lastUpdated === "string"
                  ? lastUpdated
                  : lastUpdated.toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: true,
                    })}
              </span>
            )}
          </div>

          {/* Right Side: Rows per page selector + Page navigation */}
          <div className="flex items-center gap-3 ml-auto sm:ml-0">
            {/* Rows per page dropdown */}
            <label className="flex items-center gap-1.5 text-xs text-ink-subtle">
              <span className="hidden sm:inline">Rows per page</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(0);
                }}
                className="rounded-md border border-line bg-surface px-2 py-1 text-xs font-medium text-ink hover:bg-surface-muted focus:border-brand focus:outline-none"
                aria-label="Rows per page"
              >
                {pageSizeOptions.map((sz) => (
                  <option key={sz} value={sz}>
                    {sz}
                  </option>
                ))}
              </select>
            </label>

            {/* Pagination Controls */}
            <div className="flex items-center gap-1">
              {/* First Page (<<) */}
              <button
                type="button"
                onClick={() => setPage(0)}
                disabled={current === 0}
                aria-label="First page"
                className="grid h-7 w-7 place-items-center rounded-md border border-line text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronsLeft className="h-3.5 w-3.5" aria-hidden />
              </button>

              {/* Previous Page (<) */}
              <button
                type="button"
                onClick={() => setPage(current - 1)}
                disabled={current === 0}
                aria-label="Previous page"
                className="grid h-7 w-7 place-items-center rounded-md border border-line text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              </button>

              {/* Page Indicator */}
              <span className="px-2 text-xs font-medium text-ink tabular">
                Page {current + 1} of {pages}
              </span>

              {/* Next Page (>) */}
              <button
                type="button"
                onClick={() => setPage(current + 1)}
                disabled={current >= pages - 1}
                aria-label="Next page"
                className="grid h-7 w-7 place-items-center rounded-md border border-line text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </button>

              {/* Last Page (>>) */}
              <button
                type="button"
                onClick={() => setPage(pages - 1)}
                disabled={current >= pages - 1}
                aria-label="Last page"
                className="grid h-7 w-7 place-items-center rounded-md border border-line text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronsRight className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Checkbox component with indeterminate state support */
function TableCheckbox({
  checked,
  indeterminate,
  onChange,
  disabled,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = Boolean(indeterminate && !checked);
    }
  }, [indeterminate, checked]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      aria-label={ariaLabel}
      className="h-4 w-4 rounded border-line/80 text-brand accent-[#003887] focus:ring-1 focus:ring-brand focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-40"
    />
  );
}
