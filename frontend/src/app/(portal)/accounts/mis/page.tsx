"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, Coins, Percent, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/inputs";
import { Segmented } from "@/components/ui/segmented";
import { StatCard } from "@/components/ui/stat";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { monthName, usePnl, usePnlFilters, usePnlLedgers, type Head } from "@/components/accounts/mis-api";
import { inr, monthsBetween, MonthRange, pct } from "@/components/accounts/mis-parts";

interface Line {
  key: string;
  label: string;
  Revenue: number;
  Expense: number;
  Tax: number;
}

/** P&L by entity from Tally (ASA MIS): Revenue − Expense by month or firm; click a figure for its ledgers. */
export default function PnlPage() {
  const filters = usePnlFilters();
  const months = useMemo(() => filters.data?.months ?? [], [filters.data]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const onRange = useCallback((f: string, t: string) => (setFrom(f), setTo(t)), []);
  const [entityId, setEntityId] = useState("");
  const [by, setBy] = useState<"month" | "firm">("month");
  const [drill, setDrill] = useState<Head | null>(null);

  const chosen = useMemo(() => (from && to ? monthsBetween(months, from, to) : []), [months, from, to]);
  const entityIds = entityId ? [entityId] : [];
  const q = usePnl(entityIds, chosen);
  const ledgers = usePnlLedgers(entityIds, chosen, drill);
  const names = useMemo(() => new Map((filters.data?.entities ?? []).map((e) => [e.id, e.name])), [filters.data]);

  const lines = useMemo(() => {
    const acc = new Map<string, Line>();
    for (const r of q.data ?? []) {
      const key = by === "month" ? r.month : r.entityId;
      const cur = acc.get(key) ?? { key, label: by === "month" ? monthName(r.month) : names.get(r.entityId) ?? "—", Revenue: 0, Expense: 0, Tax: 0 };
      cur[r.head] += r.amount;
      acc.set(key, cur);
    }
    return [...acc.values()];
  }, [q.data, by, names]);
  const total = lines.reduce((a, l) => ({ Revenue: a.Revenue + l.Revenue, Expense: a.Expense + l.Expense, Tax: a.Tax + l.Tax }), { Revenue: 0, Expense: 0, Tax: 0 });
  const profit = total.Revenue - total.Expense;

  const columns: Column<Line>[] = [
    { key: "label", header: by === "month" ? "Month" : "Firm", sortValue: (l) => l.key, cell: (l) => <span className="font-medium text-ink">{l.label}</span> },
    { key: "rev", header: "Revenue", align: "right", sortValue: (l) => l.Revenue, cell: (l) => <span className="tabular text-ink">{inr(l.Revenue)}</span> },
    { key: "exp", header: "Expense", align: "right", sortValue: (l) => l.Expense, cell: (l) => <span className="tabular text-ink-muted">{inr(l.Expense)}</span> },
    {
      key: "profit",
      header: "Net profit",
      align: "right",
      sortValue: (l) => l.Revenue - l.Expense,
      cell: (l) => <span className={`font-semibold tabular ${l.Revenue - l.Expense < 0 ? "text-danger" : "text-ink"}`}>{inr(l.Revenue - l.Expense)}</span>,
    },
    { key: "margin", header: "Margin", align: "right", hideBelow: "sm", sortValue: (l) => (l.Revenue ? (l.Revenue - l.Expense) / l.Revenue : 0), cell: (l) => <span className="tabular text-ink-muted">{pct(l.Revenue - l.Expense, l.Revenue)}</span> },
    { key: "tax", header: "Tax (GST etc.)", align: "right", hideBelow: "md", sortValue: (l) => l.Tax, cell: (l) => <span className="tabular text-ink-subtle">{inr(l.Tax)}</span> },
  ];

  if (filters.isError) return <Card><ErrorState error={filters.error} onRetry={() => filters.refetch()} /></Card>;
  if (filters.isLoading) return <Skeleton className="h-80" />;
  if (!months.length)
    return (
      <Card>
        <EmptyState
          icon={BarChart3}
          title="No Tally data yet"
          description="Import each firm’s Tally voucher registers and Ledger Masters, and the P&L builds itself."
          action={<Link href="/accounts/mis/tally" className="text-[13px] font-semibold text-brand hover:underline">Go to Tally import</Link>}
        />
      </Card>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <MonthRange months={months} from={from} to={to} onChange={onRange} />
        <Select aria-label="Firm" value={entityId} onChange={(e) => setEntityId(e.target.value)} className="w-48">
          <option value="">All firms</option>
          {(filters.data?.entities ?? []).map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </Select>
        <div className="ml-auto">
          <Segmented aria-label="Group by" value={by} onChange={setBy} options={[{ value: "month", label: "By month" }, { value: "firm", label: "By firm" }]} />
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="Totals">
        <button className="text-left" onClick={() => setDrill("Revenue")}><StatCard label="Revenue" icon={TrendingUp} tone="brand" loading={q.isLoading} value={inr(total.Revenue)} hint="Click for ledgers" /></button>
        <button className="text-left" onClick={() => setDrill("Expense")}><StatCard label="Expense" icon={TrendingDown} loading={q.isLoading} value={inr(total.Expense)} hint="Click for ledgers" /></button>
        <StatCard label="Net profit" icon={Coins} tone={profit < 0 ? "danger" : "success"} loading={q.isLoading} value={inr(profit)} />
        <StatCard label="Margin" icon={Percent} loading={q.isLoading} value={pct(profit, total.Revenue)} hint={`Tax collected ${inr(total.Tax)}`} />
      </section>

      {q.isError ? (
        <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>
      ) : (
        <DataTable itemsLabel={by === "month" ? "months" : "firms"} exportName="pnl-by-entity" rows={lines} columns={columns} rowKey={(l) => l.key} loading={q.isLoading} initialSort={{ key: "label", dir: "asc" }} />
      )}

      {drill && (
        <Card>
          <CardHeader
            icon={BarChart3}
            title={`${drill} by ledger`}
            description={`${chosen.length} month${chosen.length === 1 ? "" : "s"}${entityId ? ` · ${names.get(entityId)}` : " · all firms"}`}
            actions={
              <Segmented aria-label="Head" value={drill} onChange={(v) => setDrill(v)} options={[{ value: "Revenue", label: "Revenue" }, { value: "Expense", label: "Expense" }, { value: "Tax", label: "Tax" }]} />
            }
          />
          {ledgers.isLoading ? (
            <Skeleton className="m-5 h-40" />
          ) : (
            <ul className="divide-y divide-line px-5 pb-3">
              {(ledgers.data ?? []).slice(0, 40).map((l) => (
                <li key={l.ledger} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                  <span className="min-w-0 truncate">
                    <span className="font-medium text-ink">{l.ledger}</span>
                    <span className="text-ink-subtle"> · {l.primaryGroup ?? "no group"} · {l.entries} entries</span>
                  </span>
                  <span className="shrink-0 tabular text-ink">{inr(l.amount)}</span>
                </li>
              ))}
              {!(ledgers.data ?? []).length && <li className="py-6 text-center text-[13px] text-ink-subtle">Nothing in this head for the period.</li>}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
