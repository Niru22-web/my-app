"use client";

import { useCallback, useRef, useState } from "react";
import { CalendarDays, CalendarRange, ChevronDown, ChevronLeft, ChevronRight, Clock, LayoutGrid, List, Plus, Rows3, SlidersHorizontal, Timer } from "lucide-react";
import { addDays, endOfMonth, fmtDay, startOfMonth, today, weekStart, type YMD } from "@/lib/dates";
import { useDismiss } from "@/lib/use-outside";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { statusOf, type Timelog } from "./api";
import { MAX_AHEAD_DAYS } from "./day-info";
import { hhmm } from "./hours";

// ---- Periods -----------------------------------------------------------------------

export type PeriodKind = "day" | "week" | "semi" | "month";

export interface Period {
  kind: PeriodKind;
  from: YMD;
  to: YMD;
}

export function periodOf(kind: PeriodKind, anchor: YMD): Period {
  if (kind === "day") return { kind, from: anchor, to: anchor };
  if (kind === "week") {
    const from = weekStart(anchor);
    return { kind, from, to: addDays(from, 6) };
  }
  const first = startOfMonth(anchor);
  if (kind === "month") return { kind, from: first, to: endOfMonth(anchor) };
  return Number(anchor.slice(8)) <= 15 ? { kind, from: first, to: addDays(first, 14) } : { kind, from: addDays(first, 15), to: endOfMonth(anchor) };
}

export function shiftPeriod(p: Period, dir: -1 | 1): Period {
  if (p.kind === "day") return periodOf("day", addDays(p.from, dir));
  if (p.kind === "week") return periodOf("week", addDays(p.from, 7 * dir));
  return periodOf(p.kind, dir < 0 ? addDays(p.from, -1) : addDays(p.to, 1));
}

export function periodLabel(p: Period): string {
  if (p.kind === "day") return fmtDay(p.from, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  if (p.kind === "month") return fmtDay(p.from, { month: "short", year: "numeric" });
  return `${fmtDay(p.from, { day: "numeric", month: "short" })} – ${fmtDay(p.to, { day: "numeric", month: "short", year: "numeric" })}`;
}

/** ‹ [calendar] label › — moves through days, weeks, half-months or months. */
export function PeriodNav({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  const next = shiftPeriod(period, 1);
  const limit = addDays(today(), MAX_AHEAD_DAYS);
  const current = periodOf(period.kind, today());
  const unit = { day: "day", week: "week", semi: "half-month", month: "month" }[period.kind];
  const btn = "grid h-9 w-9 place-items-center rounded-xl border border-line bg-surface hover:bg-surface-muted disabled:opacity-40";

  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => onChange(shiftPeriod(period, -1))} className={btn} aria-label={`Previous ${unit}`}>
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="dialog"
          className="inline-flex h-9 min-w-[190px] items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-ink hover:bg-surface-muted"
        >
          <CalendarDays className="h-4 w-4 text-brand" aria-hidden />
          {periodLabel(period)}
        </button>
        {open && (
          <div role="dialog" aria-label="Go to date" className="absolute left-0 top-11 z-30 w-64 rounded-xl border border-line bg-surface p-3 shadow-pop">
            <label className="block text-xs font-medium text-ink-muted">
              {period.kind === "month" ? "Go to month" : "Go to date"}
              <input
                type={period.kind === "month" ? "month" : "date"}
                autoFocus
                defaultValue={period.kind === "month" ? period.from.slice(0, 7) : period.from}
                max={period.kind === "month" ? limit.slice(0, 7) : limit}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  onChange(periodOf(period.kind, period.kind === "month" ? `${v}-01` : v));
                  close();
                }}
                className="mt-1 h-10 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:border-brand"
              />
            </label>
            {current.from !== period.from && (
              <button type="button" onClick={() => (onChange(current), close())} className="mt-2 text-xs font-semibold text-brand hover:underline">
                Back to this {unit}
              </button>
            )}
          </div>
        )}
      </div>
      <button type="button" onClick={() => onChange(next)} disabled={next.from > limit} className={btn} aria-label={`Next ${unit}`}>
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

// ---- View switch --------------------------------------------------------------------

export function ViewSwitch({ value, onChange }: { value: "list" | "calendar"; onChange: (v: "list" | "calendar") => void }) {
  const opts = [
    { v: "list" as const, label: "List view", Icon: List },
    { v: "calendar" as const, label: "Calendar view", Icon: CalendarDays },
  ];
  return (
    <div role="radiogroup" aria-label="View" className="inline-flex rounded-xl border border-line bg-surface p-0.5">
      {opts.map(({ v, label, Icon }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          aria-label={label}
          title={label}
          onClick={() => onChange(v)}
          className={cn("grid h-8 w-9 place-items-center rounded-lg", value === v ? "bg-brand text-brand-ink" : "text-ink-muted hover:bg-surface-muted hover:text-ink")}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}

export function FilterButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <Button variant="secondary" onClick={onClick} className="h-9" aria-label={count ? `Filter, ${count} active` : "Filter"}>
      <SlidersHorizontal className="h-4 w-4" /> Filter
      {count > 0 && <span className="rounded-full bg-brand px-1.5 text-[11px] font-semibold text-brand-ink tabular">{count}</span>}
    </Button>
  );
}

// ---- Log time split button --------------------------------------------------------

export type LogAction = "single" | "timer" | "day" | "week" | "semi" | "month";

export function LogTimeButton({ onAction }: { onAction: (a: LogAction) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  const items: { a: LogAction; label: string; hint: string; Icon: typeof Plus }[] = [
    { a: "single", label: "Log time", hint: "One entry for a job", Icon: Plus },
    { a: "timer", label: "Start a timer", hint: "Track time as you work", Icon: Timer },
    { a: "day", label: "Daily log", hint: "Several jobs for one day", Icon: Rows3 },
    { a: "week", label: "Weekly log", hint: "Grid of jobs × days for a week", Icon: LayoutGrid },
    { a: "semi", label: "Semi-monthly log", hint: "1st–15th or 16th–month end", Icon: CalendarRange },
    { a: "month", label: "Monthly log", hint: "Grid for the whole month", Icon: CalendarDays },
  ];
  return (
    <div ref={ref} className="relative inline-flex">
      <Button onClick={() => onAction("single")} className="rounded-r-none">
        <Clock className="h-4 w-4" /> Log time
      </Button>
      <Button onClick={() => setOpen((o) => !o)} className="rounded-l-none border-l border-white/25 px-2.5" aria-label="More ways to log time" aria-expanded={open} aria-haspopup="menu">
        <ChevronDown className="h-4 w-4" />
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 z-30 w-64 rounded-2xl border border-line bg-surface p-1.5 shadow-pop">
          {items.map(({ a, label, hint, Icon }) => (
            <button
              key={a}
              type="button"
              role="menuitem"
              onClick={() => (close(), onAction(a))}
              className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-surface-muted"
            >
              <Icon className="mt-0.5 h-4 w-4 text-brand" aria-hidden />
              <span>
                <span className="block text-sm font-medium text-ink">{label}</span>
                <span className="block text-xs text-ink-subtle">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Footer summary --------------------------------------------------------------

export function SummaryFooter({ entries, onSubmitDrafts }: { entries: Timelog[]; onSubmitDrafts: () => void }) {
  const t = { total: 0, submitted: 0, approved: 0, open: 0 };
  for (const e of entries) {
    t.total += e.hours;
    const s = statusOf(e);
    if (s === "submitted") t.submitted += e.hours;
    else if (s === "approved") t.approved += e.hours;
    else t.open += e.hours;
  }
  const cell = "flex min-w-0 flex-col px-1 py-1 sm:flex-row sm:items-baseline sm:gap-2 sm:px-3 sm:py-1.5";
  return (
    <div className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-surface/95 px-4 py-1.5 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="grid grid-cols-4 items-center gap-x-1 text-[11px] sm:flex sm:justify-between sm:gap-x-2 sm:text-[13px]">
        <span className={cell}>
          <span className="text-ink-subtle">Total</span> <span className="font-mono font-bold tabular text-ink">{hhmm(t.total)}</span>
        </span>
        <span className={cell}>
          <span className="text-ink-subtle">Submitted</span> <span className="font-mono font-semibold tabular text-warning">{hhmm(t.submitted)}</span>
        </span>
        <span className={cell}>
          <span className="text-ink-subtle">Approved</span> <span className="font-mono font-semibold tabular text-success">{hhmm(t.approved)}</span>
        </span>
        <button
          type="button"
          onClick={onSubmitDrafts}
          disabled={t.open === 0}
          className={cn(cell, "rounded-lg text-left enabled:hover:bg-brand-softer disabled:cursor-default")}
          title={t.open ? "Submit all drafts in this period" : undefined}
        >
          <span className="text-ink-subtle">Not submitted</span>{" "}
          <span className={cn("font-mono font-semibold tabular", t.open ? "text-brand underline decoration-dotted underline-offset-4" : "text-ink")}>{hhmm(t.open)}</span>
        </button>
      </div>
    </div>
  );
}
