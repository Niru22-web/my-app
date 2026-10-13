"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { addDays, endOfMonth, fmtDay, isWeekend, startOfMonth, today, workDate, type YMD } from "@/lib/dates";
import { formatHours } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Envelope } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { MonthGrid } from "@/components/ui/month-grid";
import { Skeleton } from "@/components/ui/skeleton";
import { leaveState, useLeaves } from "@/components/leave/api";
import { realDate, useMyDetails } from "@/components/profile/api";
import { statusOf, type Timelog } from "./api";

const DOT: Record<string, string> = { draft: "bg-neutral", submitted: "bg-brand", approved: "bg-success", rejected: "bg-danger" };
const LEGEND = [
  ["draft", "Draft"],
  ["submitted", "Awaiting approval"],
  ["approved", "Approved"],
  ["rejected", "Returned"],
] as const;

/**
 * Month calendar for My timesheet: hours and status per day, holidays and approved leave marked,
 * and missed working days flagged. Clicking a day selects it; an empty past day opens "Log time".
 */
export function MonthCalendar({
  month,
  entries,
  loading,
  selected,
  onSelect,
  onLog,
}: {
  month: YMD;
  entries: Timelog[];
  loading: boolean;
  selected: YMD | null;
  onSelect: (d: YMD | null) => void;
  onLog: (d: YMD) => void;
}) {
  const { user } = useAuth();
  const now = today();
  const from = startOfMonth(month);
  const to = endOfMonth(month);

  const events = useQuery({
    queryKey: ["events"],
    queryFn: async () => (await api<Envelope<{ date: string; type: string; title: string }[]>>("events")).data ?? [],
    staleTime: 5 * 60_000,
  });
  const leaves = useLeaves({ employeeId: user?.id }, !!user);
  // Days before someone joined are never "missed".
  const me = useMyDetails(user?.id);
  const joinedOn = workDate(realDate(me.data?.profile?.doj) ?? me.data?.createdAt ?? "") || "0000-00-00";

  const holidays = useMemo(() => new Map((events.data ?? []).filter((e) => e.type === "Holiday").map((e) => [workDate(e.date), e.title])), [events.data]);
  const onLeave = useMemo(() => {
    const s = new Map<YMD, string>();
    for (const l of leaves.data ?? []) {
      if (leaveState(l) !== "approved") continue;
      for (let d = workDate(l.fromDate); d <= workDate(l.toDate); d = addDays(d, 1)) s.set(d, l.type);
    }
    return s;
  }, [leaves.data]);

  const perDay = useMemo(() => {
    const m = new Map<YMD, { hours: number; statuses: Set<string> }>();
    for (const e of entries) {
      const d = workDate(e.date);
      const v = m.get(d) ?? { hours: 0, statuses: new Set<string>() };
      v.hours += e.hours;
      v.statuses.add(statusOf(e));
      m.set(d, v);
    }
    return m;
  }, [entries]);

  // Count from the joining date, or the first day with time logged if that is earlier.
  const firstLogged = useMemo(() => [...perDay.keys()].sort()[0] ?? "9999-99-99", [perDay]);
  const startOn = joinedOn < firstLogged ? joinedOn : firstLogged;
  const stats = useMemo(() => {
    const workday = (d: YMD) => !isWeekend(d) && !holidays.has(d) && !onLeave.has(d);
    let logged = 0, expectedDays = 0, missed = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) {
      logged += perDay.get(d)?.hours ?? 0;
      if (d <= now && d >= startOn && workday(d)) {
        expectedDays++;
        if (!perDay.get(d)?.hours && d < now) missed++;
      }
    }
    return { logged, target: expectedDays * 8, expectedDays, missed };
  }, [from, to, now, perDay, holidays, onLeave, startOn]);
  const workday = (d: YMD) => !isWeekend(d) && !holidays.has(d) && !onLeave.has(d);

  if (loading) return <Skeleton className="h-[560px]" />;

  const pct = stats.target ? Math.min(100, Math.round((stats.logged / stats.target) * 100)) : 0;

  return (
    <div className="space-y-3">
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium text-ink-muted">{fmtDay(from, { month: "long", year: "numeric" })}</p>
            <p className="text-xs text-ink-subtle">Target {stats.target} h · {stats.expectedDays} working day{stats.expectedDays === 1 ? "" : "s"} so far</p>
          </div>
          <p className="mt-1 font-display text-3xl font-bold tabular text-ink">
            {stats.logged.toFixed(1)}
            <span className="text-lg font-semibold text-ink-subtle"> / {stats.target} h</span>
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted">
            <div className={cn("h-full rounded-full transition-all", pct >= 100 ? "bg-success" : "bg-brand")} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="flex shrink-0 gap-6 text-sm sm:pl-6">
          <div>
            <p className="text-xs text-ink-subtle">Missed days</p>
            <p className={cn("text-xl font-bold tabular", stats.missed ? "text-danger" : "text-ink")}>{stats.missed}</p>
          </div>
          <div>
            <p className="text-xs text-ink-subtle">Days logged</p>
            <p className="text-xl font-bold tabular text-ink">{[...perDay.keys()].filter((d) => d >= from && d <= to).length}</p>
          </div>
        </div>
      </Card>

      <MonthGrid
        month={month}
        selected={selected}
        onSelect={(d) => {
          const has = !!perDay.get(d)?.hours;
          if (!has && d <= now) onLog(d);
          onSelect(selected === d ? null : d);
        }}
        renderDay={(d, inMonth) => {
          if (!inMonth) return null;
          const v = perDay.get(d);
          const holiday = holidays.get(d);
          const leave = onLeave.get(d);
          const missed = !v?.hours && d < now && d >= startOn && workday(d);
          return (
            <div className="flex h-full flex-col justify-between gap-1">
              {v?.hours ? (
                <p className={cn("text-sm font-bold tabular sm:text-base", v.hours > 12 ? "text-warning" : "text-ink")}>{formatHours(v.hours)}</p>
              ) : holiday ? (
                <p className="truncate text-[10px] font-medium text-danger sm:text-[11px]" title={holiday}>{holiday}</p>
              ) : leave ? (
                <p className="truncate text-[10px] font-medium text-brand sm:text-[11px]">On leave</p>
              ) : missed ? (
                <p className="text-[10px] font-medium text-danger/80 sm:text-[11px]">Not logged</p>
              ) : d === now && !isWeekend(d) ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-brand">
                  <Plus className="h-3 w-3" /> Log
                </span>
              ) : null}
              {v && (
                <span className="flex gap-1">
                  {[...v.statuses].map((s) => (
                    <span key={s} className={cn("h-1.5 w-1.5 rounded-full", DOT[s])} aria-hidden />
                  ))}
                </span>
              )}
            </div>
          );
        }}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
        {LEGEND.map(([k, l]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", DOT[k])} aria-hidden /> {l}
          </span>
        ))}
        <span className="text-ink-subtle">· Click an empty day to log time for it.</span>
      </div>
    </div>
  );
}
