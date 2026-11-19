"use client";

import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { useCostMonths, useDataChecks, type DataCheck } from "@/components/accounts/mis-api";
import { monthsBetween, MonthRange } from "@/components/accounts/mis-parts";

/** Data checks (ASA MIS data quality + cross-checks between payroll, Tally and portal timesheets). */
export default function DataChecksPage() {
  const months = useCostMonths("payroll");
  const tallyMonths = useCostMonths("tally");
  const all = useMemo(() => [...new Set([...(months.data ?? []), ...(tallyMonths.data ?? [])])].sort(), [months.data, tallyMonths.data]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const onRange = useCallback((f: string, t: string) => (setFrom(f), setTo(t)), []);
  const chosen = useMemo(() => (from && to ? monthsBetween(all, from, to) : []), [all, from, to]);
  const q = useDataChecks(chosen);
  const warn = (q.data ?? []).filter((c) => c.status === "warn").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-[13px] text-ink-muted">
          Checks that the figures behind the P&L, cost allocation and vertical MIS are complete and tie up. {all.length ? "Pick months to also check cost against timesheets." : ""}
        </p>
        <MonthRange months={all} from={from} to={to} onChange={onRange} />
      </div>
      {q.isError ? (
        <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>
      ) : q.isLoading ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <p className={cn("flex items-center gap-2 text-sm font-medium", warn ? "text-warning" : "text-success")}>
            {warn ? <AlertTriangle className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
            {warn ? `${warn} check${warn === 1 ? "" : "s"} need attention` : "Everything checked ties up"}
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            {(q.data ?? []).map((c) => (
              <Check key={c.key} c={c} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Check({ c }: { c: DataCheck }) {
  const Icon = c.status === "ok" ? CheckCircle2 : c.status === "warn" ? AlertTriangle : Info;
  const cols = c.sample.length ? Object.keys(c.sample[0]) : [];
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", c.status === "ok" ? "text-success" : c.status === "warn" ? "text-warning" : "text-brand")} aria-hidden />
        <div className="min-w-0">
          <p className="font-semibold text-ink">{c.title}</p>
          <p className="mt-0.5 text-[13px] text-ink-muted">{c.detail}</p>
        </div>
      </div>
      {c.sample.length > 0 && (
        <div className="mt-3 max-h-64 overflow-auto rounded-xl border border-line">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-surface-muted text-left text-ink-subtle">
              <tr>{cols.map((k) => <th key={k} className="px-3 py-1.5 font-medium capitalize">{k.replace(/([A-Z])/g, " $1")}</th>)}</tr>
            </thead>
            <tbody>
              {c.sample.map((row, i) => (
                <tr key={i} className="border-t border-line">
                  {cols.map((k) => {
                    const v = row[k];
                    return <td key={k} className={cn("px-3 py-1.5", typeof v === "number" && "text-right tabular")}>{typeof v === "number" ? Math.round(v).toLocaleString("en-IN") : String(v ?? "—")}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
