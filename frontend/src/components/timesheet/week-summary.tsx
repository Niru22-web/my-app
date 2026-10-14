"use client";

import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtDay, isWeekend, today, workDate, type YMD } from "@/lib/dates";
import { standardDayHours } from "@/lib/work-calendar";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { statusOf, type Timelog } from "./api";

/**
 * Week overview: progress towards the week’s expected hours (working days × the firm’s hours per day)
 * and a day strip. Mirrors how compliance counts — working days only, every entry regardless of status.
 */
export function WeekSummary({
  days,
  entries,
  loading,
  selected,
  onSelect,
}: {
  days: YMD[];
  entries: Timelog[];
  loading: boolean;
  selected: YMD | null;
  onSelect: (d: YMD | null) => void;
}) {
  const perDay = new Map<YMD, number>();
  for (const e of entries) {
    const d = workDate(e.date);
    perDay.set(d, (perDay.get(d) ?? 0) + e.hours);
  }
  const weekdayHours = days.filter((d) => !isWeekend(d)).reduce((a, d) => a + (perDay.get(d) ?? 0), 0);
  const weekTotal = days.reduce((a, d) => a + (perDay.get(d) ?? 0), 0);
  const TARGET = days.filter((d) => !isWeekend(d)).length * standardDayHours();
  const pct = TARGET ? Math.min(100, Math.round((weekdayHours / TARGET) * 100)) : 0;
  const now = today();
  const missing = days.filter((d) => !isWeekend(d) && d < now && !(perDay.get(d) ?? 0));

  const counts = { draft: 0, submitted: 0, approved: 0, rejected: 0 };
  for (const e of entries) counts[statusOf(e)]++;

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
        <div className="lg:w-[300px] lg:shrink-0">
          <div className="flex items-baseline justify-between">
            <p className="text-[13px] font-medium text-ink-muted">Working-day hours</p>
            <p className="text-xs text-ink-subtle">Target {TARGET} h</p>
          </div>
          {loading ? (
            <Skeleton className="mt-2 h-9 w-32" />
          ) : (
            <p className="mt-1 font-display text-[32px] font-bold leading-none text-ink tabular">
              {weekdayHours.toFixed(1)}
              <span className="ml-1 text-base font-semibold text-ink-subtle">/ {TARGET} h</span>
            </p>
          )}
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to this week’s expected hours">
            <div className={cn("h-full rounded-full transition-[width] duration-500", pct >= 100 ? "bg-success" : "bg-brand")} style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-subtle">
            <span>
              Week total <span className="font-semibold text-ink tabular">{weekTotal.toFixed(1)} h</span>
            </span>
            {counts.draft > 0 && <span>{counts.draft} draft</span>}
            {counts.submitted > 0 && <span>{counts.submitted} awaiting</span>}
            {counts.approved > 0 && <span>{counts.approved} approved</span>}
            {counts.rejected > 0 && <span className="font-semibold text-danger">{counts.rejected} returned</span>}
          </div>
        </div>

        <div className="grid flex-1 grid-cols-7 gap-1.5 sm:gap-2" role="group" aria-label="Days of the week">
          {days.map((d) => {
            const h = perDay.get(d) ?? 0;
            const isMissing = missing.includes(d);
            const isToday = d === now;
            const active = selected === d;
            const future = d > now;
            return (
              <button
                key={d}
                onClick={() => onSelect(active ? null : d)}
                aria-pressed={active}
                aria-label={`${fmtDay(d, { weekday: "long", day: "numeric", month: "long" })}: ${h ? `${+h.toFixed(2)} hours` : isMissing ? "no time logged" : "no entries"}`}
                className={cn(
                  "flex flex-col items-center rounded-xl border px-1 py-2.5 text-center transition-colors",
                  active ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface-muted hover:border-brand/40",
                  isWeekend(d) && !active && "bg-surface",
                  future && !active && "opacity-60",
                )}
              >
                <span className={cn("text-[11px] font-semibold uppercase", active ? "text-white/80" : "text-ink-subtle")}>{fmtDay(d, { weekday: "short" })}</span>
                <span className={cn("text-sm font-bold tabular", active ? "text-white" : isToday ? "text-brand" : "text-ink")}>{fmtDay(d, { day: "numeric" })}</span>
                <span className={cn("mt-1 flex items-center gap-1 text-[11px] font-semibold tabular", active ? "text-white" : h ? "text-ink" : isMissing ? "text-danger" : "text-ink-subtle")}>
                  {isMissing && !active && <span className="h-1.5 w-1.5 rounded-full bg-danger" aria-hidden />}
                  {h ? `${+h.toFixed(2)}h` : isMissing ? "0h" : "—"}
                  {isMissing && <span className="sr-only">, missing</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {!loading && missing.length > 0 && (
        <p className="mt-4 flex items-center gap-2 rounded-xl bg-warning-soft px-3 py-2 text-[13px] text-ink">
          <AlertCircle className="h-4 w-4 shrink-0 text-warning" aria-hidden />
          No time logged for {missing.map((d) => fmtDay(d, { weekday: "long" })).join(", ")}. If you were on approved leave, you can ignore this.
        </p>
      )}
    </Card>
  );
}
