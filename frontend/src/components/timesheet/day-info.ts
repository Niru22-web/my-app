"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { addDays, today, workDate, type YMD } from "@/lib/dates";
import { isWeeklyOff, standardDayHours } from "@/lib/work-calendar";
import type { Envelope } from "@/lib/types";
import { leaveState, useLeaves } from "@/components/leave/api";
import { useTimesheetLock } from "./api";

/** How far ahead time can be logged (server rule). */
export const MAX_AHEAD_DAYS = 7;

export interface DayInfo {
  holidays: Map<YMD, string>;
  leave: Map<YMD, string>;
  lockedThrough: string | null;
  isOff: (d: YMD) => boolean;
  /** Weekly off, firm holiday or approved leave. */
  isNonWorking: (d: YMD) => boolean;
  /** Expected hours for a day (0 for weekly offs, holidays and leave). */
  expected: (d: YMD) => number;
  /** Time can be added/changed on this day (not locked, not more than 7 days ahead). */
  canLog: (d: YMD) => boolean;
  /** Why a day is read-only, or null. */
  readOnlyReason: (d: YMD) => string | null;
}

/**
 * Firm holidays (events of type Holiday), the signed-in person's approved leave, weekly offs and the period lock —
 * what every Time logs view needs to shade days and work out expected hours.
 */
export function useDayInfo(): DayInfo {
  const { user } = useAuth();
  const events = useQuery({
    queryKey: ["events"],
    queryFn: async () => (await api<Envelope<{ date: string; type: string; title: string }[]>>("events")).data ?? [],
    staleTime: 5 * 60_000,
  });
  const leaves = useLeaves({ employeeId: user?.id }, !!user);
  const lock = useTimesheetLock();
  // "Nothing locked" is stored as 2019-12-31 (before the earliest allowed date), so treat that as no lock.
  const rawLock = lock.data?.lockedThrough ?? null;
  const lockedThrough = rawLock && rawLock >= "2020-01-01" ? rawLock : null;

  const holidays = useMemo(
    () => new Map((events.data ?? []).filter((e) => e.type === "Holiday").map((e) => [workDate(e.date), e.title] as [YMD, string])),
    [events.data],
  );
  const leave = useMemo(() => {
    const s = new Map<YMD, string>();
    for (const l of leaves.data ?? []) {
      if (leaveState(l) !== "approved") continue;
      const end = workDate(l.toDate);
      for (let d = workDate(l.fromDate); d && d <= end; d = addDays(d, 1)) s.set(d, l.type);
    }
    return s;
  }, [leaves.data]);

  return useMemo(() => {
    const limit = addDays(today(), MAX_AHEAD_DAYS);
    const isNonWorking = (d: YMD) => isWeeklyOff(d) || holidays.has(d) || leave.has(d);
    const readOnlyReason = (d: YMD) =>
      lockedThrough && d <= lockedThrough ? "This period is locked." : d > limit ? `Time can be logged at most ${MAX_AHEAD_DAYS} days ahead.` : null;
    return {
      holidays,
      leave,
      lockedThrough,
      isOff: isWeeklyOff,
      isNonWorking,
      expected: (d: YMD) => (isNonWorking(d) ? 0 : standardDayHours()),
      canLog: (d: YMD) => !readOnlyReason(d),
      readOnlyReason,
    };
  }, [holidays, leave, lockedThrough]);
}
