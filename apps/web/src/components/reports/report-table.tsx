"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Download, Printer, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatCurrency, formatDate, formatHours, formatNumber } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/inputs";
import { Badge, statusTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { downloadCsv } from "@/components/claims/claim-tabs";
import type { Column, Fmt, Row } from "./api";

export function formatValue(v: string | number | null | undefined, f: Fmt | undefined): string {
  if (v == null || v === "") return "—";
  if (typeof v === "string" && f !== "date") return v;
  switch (f) {
    case "number": return formatNumber(Number(v));
    case "hours": return formatHours(Number(v));
    case "percent": {
      const p = Number(v) * 100;
      return `${p > 0 && p < 10 ? p.toFixed(1) : Math.round(p)}%`;
    }
    case "currency": return formatCurrency(Number(v));
    case "date": return formatDate(String(v), { day: "numeric", month: "short", year: "numeric" });
    default: return String(v);
  }
}
/** Plain value for CSV (no thousands separators, percentages as numbers). */
function csvValue(v: string | number | null | undefined, f: Fmt | undefined) {
  if (v == null) return "";
  if (f === "percent" && typeof v === "number") return Math.round(v * 1000) / 10;
  return v;
}

const PAGE = 50;

export function ReportTable({ columns, rows, fileName }: { columns: Column[]; rows: Row[]; fileName: string }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [limit, setLimit] = useState(PAGE);
  // Very wide registers (muster roll) keep the first two columns pinned.
  const wide = columns.length > 12;

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = needle ? rows.filter((r) => Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(needle))) : rows;
    if (sort) {
      out = [...out].sort((a, b) => {
        const x = a[sort.key], y = b[sort.key];
        if (x == null) return 1;
        if (y == null) return -1;
        return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * sort.dir;
      });
    }
    return out;
  }, [rows, q, sort]);

  const exportCsv = () =>
    downloadCsv(`${fileName}.csv`, columns.map((c) => c.label), view.map((r) => columns.map((c) => csvValue(r[c.key], c.format))));

  return (
    <Card className="overflow-hidden print:border-0 print:shadow-none">
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-4 print:hidden">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="Search this report" className="pl-9" aria-label="Search this report" />
        </div>
        <span className="text-[13px] text-ink-muted">{formatNumber(view.length)} {view.length === 1 ? "row" : "rows"}</span>
        <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!view.length}>
          <Download className="h-4 w-4" aria-hidden /> Export CSV
        </Button>
        <Button variant="secondary" size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden /> Print
        </Button>
      </div>

      {!view.length ? (
        <EmptyState title={rows.length ? "No rows match your search" : "Nothing to show for this period"} className="py-12" />
      ) : (
        <div className="overflow-x-auto">
          <table className={cn("w-full text-[13px]", wide && "text-xs")}>
            <thead className="bg-surface-muted text-left text-ink-muted">
              <tr>
                {columns.map((c, i) => {
                  const active = sort?.key === c.key;
                  return (
                    <th
                      key={c.key}
                      scope="col"
                      aria-sort={active ? (sort!.dir === 1 ? "ascending" : "descending") : undefined}
                      className={cn(
                        "whitespace-nowrap px-3 py-2.5 font-semibold",
                        (c.align === "right" || wide && i > 1) && "text-right",
                        wide && i < 2 && "sticky z-10 bg-surface-muted",
                        wide && i === 0 && "left-0",
                        wide && i === 1 && "left-16",
                      )}
                    >
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-ink"
                        onClick={() => setSort(active ? { key: c.key, dir: sort!.dir === 1 ? -1 : 1 } : { key: c.key, dir: c.align === "right" ? -1 : 1 })}
                      >
                        {c.label}
                        {active && (sort!.dir === 1 ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />)}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {view.slice(0, limit).map((r, ri) => (
                <tr key={ri} className="hover:bg-surface-muted/60">
                  {columns.map((c, i) => {
                    const v = r[c.key];
                    return (
                      <td
                        key={c.key}
                        className={cn(
                          "whitespace-nowrap px-3 py-2.5 text-ink",
                          (c.align === "right" || c.format === "number" || c.format === "hours" || c.format === "percent") && "text-right tabular",
                          wide && i > 1 && "text-center tabular",
                          wide && i < 2 && "sticky z-10 bg-surface",
                          wide && i === 0 && "left-0 w-16",
                          wide && i === 1 && "left-16 font-medium",
                          !wide && i === 0 && "font-medium",
                          c.key === "description" || c.key === "reason" || c.key === "missing" ? "max-w-[320px] truncate whitespace-normal" : "",
                        )}
                        title={typeof v === "string" && v.length > 40 ? v : undefined}
                      >
                        {c.format === "badge" && v ? <Badge tone={statusTone(String(v))}>{String(v)}</Badge> : wide && i > 1 ? <DayCell v={v} /> : formatValue(v, c.format)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {view.length > limit && (
            <div className="border-t border-line p-3 text-center print:hidden">
              <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + PAGE * 2)}>
                Show more ({formatNumber(view.length - limit)} left)
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

const DAY_TONE: Record<string, string> = {
  P: "text-success font-semibold",
  HD: "text-warning font-semibold",
  SD: "text-warning font-semibold",
  A: "text-danger font-semibold",
  L: "text-brand font-semibold",
  HL: "text-brand font-semibold",
  H: "text-ink-subtle",
  WO: "text-ink-subtle",
};
function DayCell({ v }: { v: string | number | null | undefined }) {
  if (typeof v === "number") return <>{formatNumber(v)}</>;
  return <span className={DAY_TONE[String(v)] ?? "text-ink-subtle"}>{v ?? "·"}</span>;
}
