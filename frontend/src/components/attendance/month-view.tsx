"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { addDays, endOfMonth, fmtDay, isWeekend, startOfMonth, today, type YMD } from "@/lib/dates";
import { formatHours, formatTime } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/card";
import { MonthGrid } from "@/components/ui/month-grid";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/empty-state";
import { useMonthly, STATUS_TEXT, type MonthDay } from "./api";

/** Month calendar of one employee's attendance with honest, record-based totals. */
export function AttendanceMonth({ employeeCode, title = "This month", initialMonth }: { employeeCode: string | undefined; title?: string; initialMonth?: YMD }) {
  const [anchor, setAnchor] = useState<YMD>(() => startOfMonth(initialMonth ?? today()));
  const [selected, setSelected] = useState<YMD | null>(null);
  const month = anchor.slice(0, 7);
  const q = useMonthly(employeeCode, month);

  const byDay = useMemo(() => {
    const m = new Map<YMD, MonthDay>();
    for (const d of q.data?.days ?? []) {
      const prev = m.get(d.day);
      // The legacy API can return a duplicate "phantom" row for the same real day — collapse it, don't add it up.
      m.set(
        d.day,
        prev
          ? {
              ...(prev.sessions >= d.sessions ? prev : d),
              hours: Math.max(prev.hours, d.hours),
              sessions: Math.max(prev.sessions, d.sessions),
              lastOut: prev.lastOut && d.lastOut ? (prev.lastOut > d.lastOut ? prev.lastOut : d.lastOut) : (prev.lastOut ?? d.lastOut),
              status: prev.status === "auto-closed" || d.status === "auto-closed" ? "auto-closed" : prev.status,
            }
          : d,
      );
    }
    return m;
  }, [q.data]);

  const first = anchor;
  const last = endOfMonth(anchor);
  const now = today();
  const inMonth = [...byDay.values()].filter((d) => d.day >= first && d.day <= last);
  const present = inMonth.length;
  const total = inMonth.reduce((a, d) => a + d.hours, 0);

  // Past working days (Mon–Fri) in this month without any record. Leave/holidays aren't linked yet,
  // so these are shown as "no record", not "absent".
  let noRecord = 0;
  for (let d = first; d <= last && d < now; d = addDays(d, 1)) if (!isWeekend(d) && !byDay.has(d)) noRecord++;

  const sel = selected ? byDay.get(selected) : undefined;
  const isCurrent = anchor === startOfMonth(now);

  return (
    <Card>
      <CardHeader
        icon={CalendarDays}
        title={title}
        description={fmtDay(anchor, { month: "long", year: "numeric" })}
        actions={
          <div className="flex items-center gap-1">
            <button onClick={() => (setAnchor(startOfMonth(addDays(anchor, -1))), setSelected(null))} className="grid h-9 w-9 place-items-center rounded-xl border border-line hover:bg-surface-muted" aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => (setAnchor(startOfMonth(addDays(last, 1))), setSelected(null))}
              disabled={isCurrent}
              className="grid h-9 w-9 place-items-center rounded-xl border border-line hover:bg-surface-muted disabled:opacity-40"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 px-5 pt-4 sm:grid-cols-4">
        <Tile label="Days present" value={q.isLoading ? null : String(present)} />
        <Tile label="Hours recorded" value={q.isLoading ? null : formatHours(total)} />
        <Tile label="Avg per day" value={q.isLoading ? null : present ? formatHours(total / present) : "—"} />
        <Tile label="Weekdays without record" value={q.isLoading ? null : String(noRecord)} tone={noRecord ? "warning" : undefined} />
      </div>

      <div className="p-5">
        {q.isError ? (
          <ErrorState onRetry={() => q.refetch()} />
        ) : q.isLoading ? (
          <Skeleton className="h-[420px]" />
        ) : (
          <MonthGrid
            month={anchor}
            selected={selected}
            onSelect={(d) => setSelected(d === selected ? null : d)}
            renderDay={(d, inM) => {
              if (!inM) return null;
              const rec = byDay.get(d);
              if (rec)
                return (
                  <div className={cn("rounded-md px-1.5 py-1 text-[11px] font-semibold tabular", rec.status === "auto-closed" ? "bg-warning-soft text-warning" : "bg-brand-soft text-brand")}>
                    {rec.hours ? formatHours(rec.hours) : "In"}
                    {rec.status === "auto-closed" && <span className="ml-1 hidden font-medium sm:inline">auto</span>}
                  </div>
                );
              if (d < now && !isWeekend(d))
                return (
                  <span className="text-[10px] text-ink-subtle">
                    <span className="sm:hidden" aria-hidden>
                      —
                    </span>
                    <span className="max-sm:sr-only">No record</span>
                  </span>
                );
              return null;
            }}
          />
        )}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-subtle">
          <Legend className="bg-brand-soft" label="Present (hours recorded)" />
          <Legend className="bg-warning-soft" label="Auto-closed — no check-out" />
          <span>“No record” = no check-in on a working day (leave and holidays aren’t linked yet)</span>
        </div>

        {selected && (
          <div className="mt-4 rounded-xl border border-line bg-surface-muted p-4">
            <p className="text-sm font-semibold text-ink">{fmtDay(selected, { weekday: "long", day: "numeric", month: "long" })}</p>
            {sel ? (
              <dl className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Item label="Status" value={STATUS_TEXT[sel.status]} />
                <Item label="First in" value={formatTime(sel.firstIn)} />
                <Item label="Last out" value={sel.lastOut ? formatTime(sel.lastOut) : "—"} />
                <Item label="Hours" value={`${formatHours(sel.hours)} · ${sel.sessions} session${sel.sessions === 1 ? "" : "s"}`} />
              </dl>
            ) : (
              <p className="mt-1 text-sm text-ink-muted">No attendance recorded on this day.</p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function Tile({ label, value, tone }: { label: string; value: string | null; tone?: "warning" }) {
  return (
    <div className="rounded-xl bg-surface-muted px-3 py-2.5">
      <p className="text-[11px] text-ink-subtle">{label}</p>
      {value === null ? <Skeleton className="mt-1 h-6 w-12" /> : <p className={cn("font-display text-lg font-bold tabular", tone === "warning" ? "text-warning" : "text-ink")}>{value}</p>}
    </div>
  );
}
function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2.5 w-2.5 rounded-sm", className)} aria-hidden /> {label}
    </span>
  );
}
function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-subtle">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}
