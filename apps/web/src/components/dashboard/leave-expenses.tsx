"use client";

import Link from "next/link";
import { CalendarRange, Wallet } from "lucide-react";
import type { CombinedDashboard } from "@/lib/types";
import { formatCurrency, formatNumber } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

export function LeaveCard({ data, loading }: { data?: CombinedDashboard; loading: boolean }) {
  const l = data?.leaves;
  // Only shown once paid leave types with an entitlement exist (Leave Tracker → Leave policy).
  const hasRecord = !!l?.configured;
  const usedPct = hasRecord && l!.total > 0 ? Math.min(100, Math.round((l!.used / l!.total) * 100)) : 0;
  return (
    <Card className="flex flex-col">
      <CardHeader
        icon={CalendarRange}
        title="Leave balance"
        description="Paid leave this leave year"
        actions={
          <Link href="/leave" className="text-[13px] font-semibold text-brand hover:underline">
            Apply
          </Link>
        }
      />
      <div className="flex-1 p-5">
        {loading ? (
          <Skeleton className="h-24" />
        ) : !hasRecord ? (
          <EmptyState icon={CalendarRange} title="No leave allocation yet" description="Your balance will appear once HR sets up the leave policy." />
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <p className="font-display text-[32px] font-bold leading-none text-ink tabular">{formatNumber(l!.balance)}</p>
              <p className="text-[13px] text-ink-muted">days available</p>
            </div>
            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuenow={usedPct} aria-valuemin={0} aria-valuemax={100} aria-label="Leave used">
              <div className="h-full rounded-full bg-brand" style={{ width: `${usedPct}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-xs text-ink-subtle">
              <span>
                <span className="font-semibold text-ink tabular">{formatNumber(l!.used)}</span> used
              </span>
              <span>
                <span className="font-semibold text-ink tabular">{formatNumber(l!.total)}</span> for the year
              </span>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

export function ExpensesCard({ data, loading }: { data?: CombinedDashboard; loading: boolean }) {
  const e = data?.expenses;
  const rows = [...(e?.breakdown ?? [])].sort((a, b) => b.amount - a.amount);
  const max = rows[0]?.amount ?? 0;
  return (
    <Card className="flex flex-col">
      <CardHeader
        icon={Wallet}
        title="My reimbursements"
        description="Claimed by category, all statuses"
        actions={
          <Link href="/portal/reimbursements" className="text-[13px] font-semibold text-brand hover:underline">
            New claim
          </Link>
        }
      />
      <div className="flex-1 p-5">
        {loading ? (
          <Skeleton className="h-24" />
        ) : rows.length === 0 ? (
          <EmptyState icon={Wallet} title="No reimbursement claims yet" />
        ) : (
          <>
            <p className="font-display text-[28px] font-bold leading-none text-ink tabular">{formatCurrency(e!.total)}</p>
            <ul className="mt-4 space-y-3">
              {rows.slice(0, 5).map((r) => (
                <li key={r.category}>
                  <div className="flex justify-between text-[13px]">
                    <span className="truncate text-ink-muted">{r.category}</span>
                    <span className="font-semibold text-ink tabular">{formatCurrency(r.amount)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${max ? (r.amount / max) * 100 : 0}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Card>
  );
}
