"use client";

import Link from "next/link";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import type { ComplianceDashboard } from "@/lib/types";
import { formatDate, formatNumber } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";

/** Team / firm timesheet compliance for the week, using the API's own KPI figures. */
export function ComplianceCard({
  data,
  loading,
  error,
  onRetry,
  scope,
}: {
  data?: ComplianceDashboard;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  scope: "firm" | "team";
}) {
  const k = data?.kpis;
  const pct = Math.max(0, Math.min(100, k?.weeklyCompliance ?? 0));

  return (
    <Card className="flex flex-col">
      <CardHeader
        icon={ShieldCheck}
        title="Timesheet compliance"
        description={
          data ? `${scope === "firm" ? "Firm-wide" : "Your team"} · week of ${formatDate(data.weekStart, { day: "2-digit", month: "short" })}` : "This week"
        }
        actions={
          <Link href="/compliance" className="text-[13px] font-semibold text-brand hover:underline">
            View details
          </Link>
        }
      />
      <div className="flex-1 p-5">
        {loading ? (
          <Skeleton className="h-[150px]" />
        ) : error ? (
          <ErrorState onRetry={onRetry} />
        ) : !k || k.totalEmployees === 0 ? (
          <EmptyState icon={ShieldCheck} title="No compliance data for this week" />
        ) : (
          <>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="font-display text-[32px] font-bold leading-none text-ink tabular">{pct}%</p>
                <p className="mt-1 text-[13px] text-ink-muted">
                  {formatNumber(k.compliantEmployees)} of {formatNumber(k.totalEmployees)} people compliant
                </p>
              </div>
              {k.criticalRisk > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-soft px-2.5 py-1 text-xs font-semibold text-danger">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> {k.criticalRisk} critical
                </span>
              )}
            </div>
            <div
              className="mt-4 h-2.5 overflow-hidden rounded-full bg-surface-muted"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Weekly compliance"
            >
              <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </div>
            <dl className="mt-5 grid grid-cols-3 gap-3">
              <Metric label="Missed yesterday" value={k.missingYesterday} />
              <Metric label="Below target hours" value={k.below40Hours} />
              <Metric label="Utilisation" value={`${k.teamUtilization}%`} />
            </dl>
          </>
        )}
      </div>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl bg-surface-muted px-3 py-2.5">
      <dt className="text-[11px] text-ink-subtle">{label}</dt>
      <dd className="mt-0.5 font-display text-lg font-bold text-ink tabular">{typeof value === "number" ? formatNumber(value) : value}</dd>
    </div>
  );
}

/** Personal reminder for employees whose logged hours this week are under target. */
export function PersonalComplianceBanner({ data, userId }: { data?: ComplianceDashboard; userId?: string }) {
  // Compliance rows carry the employee's account id (uuid) in `employeeId`; `id` may be a log id.
  const me = data?.employees.find((e) => e.employeeId === userId);
  if (!me || me.weeklyHours >= me.targetHours) return null;
  const missing = me.missingDays?.length ?? 0;
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-warning/30 bg-warning-soft p-4 sm:flex-row sm:items-center">
      <AlertTriangle className="h-5 w-5 shrink-0 text-warning" aria-hidden />
      <p className="flex-1 text-sm text-ink">
        <span className="font-semibold">Your timesheet is incomplete.</span> You’ve logged{" "}
        <span className="font-semibold tabular">{me.weeklyHours.toFixed(1)} h</span> of {me.targetHours} h this week
        {missing > 0 && <> — {missing} day{missing > 1 ? "s" : ""} missing</>}.
      </p>
      <Link href="/timesheet" className="shrink-0 rounded-xl bg-brand px-4 py-2 text-[13px] font-semibold text-brand-ink hover:bg-brand-hover">
        Update timesheet
      </Link>
    </div>
  );
}
