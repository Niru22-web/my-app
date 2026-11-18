"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, endOfMonth, fmtDay, startOfMonth, today, workDate, type YMD } from "@/lib/dates";
import { isWeeklyOff } from "@/lib/work-calendar";
import { cn } from "@/lib/cn";
import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { leaveState, personName, useLeaves, type Leave } from "./api";

/**
 * Team leave calendar: one row per person who is away this month, one column per day.
 * Solid = approved, outlined = waiting for approval. Weekly offs are shaded.
 */
export function LeaveCalendar({ scope, excludeId, source }: { scope: "team" | "org"; excludeId?: string; source?: { data?: Leave[]; isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown } }) {
  const [month, setMonth] = useState<YMD>(() => startOfMonth(today()));
  const last = endOfMonth(month);
  // When the page already holds this scope's full leave list, use it (the API's month filter is a plain
  // overlap test) instead of asking the server again for every month shown.
  const own = useLeaves({ scope, dateFrom: month, dateTo: last }, !source);
  const base = source ?? own;
  const q = useMemo(
    () => (source ? { ...base, data: base.data?.filter((l) => workDate(l.fromDate) <= last && workDate(l.toDate) >= month) } : base),
    [source, base, month, last],
  );
  const days = useMemo(() => {
    const out: YMD[] = [];
    for (let d = month; d <= last; d = addDays(d, 1)) out.push(d);
    return out;
  }, [month, last]);

  const people = useMemo(() => {
    const rows = new Map<string, { name: string; leaves: Leave[] }>();
    for (const l of q.data ?? []) {
      const st = leaveState(l);
      if (st !== "approved" && st !== "pending") continue;
      if (l.employeeId === excludeId) continue;
      const row = rows.get(l.employeeId) ?? {
        name: personName(l.employee),
        leaves: [],
      };
      row.leaves.push(l);
      rows.set(l.employeeId, row);
    }
    return [...rows.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => a.name.localeCompare(b.name));
  }, [q.data, excludeId]);

  const onDay = (ls: Leave[], d: YMD) => ls.find((l) => workDate(l.fromDate) <= d && workDate(l.toDate) >= d);
  const awayCount = (d: YMD) => people.filter((p) => onDay(p.leaves, d) && leaveState(onDay(p.leaves, d)!) === "approved").length;
  const now = today();

  return (
    <Card>
      <CardHeader
        icon={CalendarDays}
        title="Leave calendar"
        description="Who is away each day. Solid = approved, outlined = waiting for approval."
        actions={
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMonth(startOfMonth(addDays(month, -1)))}
              className="grid h-8 w-8 place-items-center rounded-lg border border-line hover:bg-surface-muted"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[130px] text-center text-sm font-semibold text-ink">{fmtDay(month, { month: "long", year: "numeric" })}</span>
            <button
              onClick={() => setMonth(startOfMonth(addDays(last, 1)))}
              className="grid h-8 w-8 place-items-center rounded-lg border border-line hover:bg-surface-muted"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        }
      />
      {q.isLoading ? (
        <div className="p-5">
          <Skeleton className="h-40" />
        </div>
      ) : q.isError ? (
        <ErrorState onRetry={() => void q.refetch()} />
      ) : people.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Nobody is on leave this month" className="py-8" />
      ) : (
        <div className="overflow-x-auto px-5 pb-5">
          <table className="w-full min-w-[720px] border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-10 w-44 bg-surface py-2 pr-3 text-left font-semibold text-ink-subtle">
                  Person
                </th>
                {days.map((d) => (
                  <th
                    key={d}
                    scope="col"
                    className={cn(
                      "min-w-[24px] py-2 text-center font-medium tabular",
                      isWeeklyOff(d) ? "text-ink-subtle/60" : "text-ink-subtle",
                      d === now && "text-brand",
                    )}
                  >
                    <span className="block">{fmtDay(d, { weekday: "narrow" })}</span>
                    {Number(d.slice(8))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <th scope="row" className="sticky left-0 z-10 max-w-[176px] truncate bg-surface py-1.5 pr-3 text-left text-[13px] font-medium text-ink">
                    {p.name}
                  </th>
                  {days.map((d) => {
                    const l = onDay(p.leaves, d);
                    const approved = l && leaveState(l) === "approved";
                    return (
                      <td key={d} className={cn("h-7 p-0.5", isWeeklyOff(d) && "bg-surface-muted/70")}>
                        {l && !isWeeklyOff(d) && (
                          <span
                            title={`${p.name} · ${l.type}${l.duration && /half/i.test(l.duration) ? " (half day)" : ""} · ${approved ? "approved" : "waiting for approval"}`}
                            className={cn("block h-full w-full rounded", approved ? "bg-brand" : "border-2 border-dashed border-brand bg-brand-softer")}
                          >
                            <span className="sr-only">{approved ? "On leave" : "Leave requested"}</span>
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" className="sticky left-0 bg-surface pt-2 pr-3 text-left font-semibold text-ink-subtle">
                  Away
                </th>
                {days.map((d) => (
                  <td key={d} className="pt-2 text-center font-semibold tabular text-ink-muted">
                    {!isWeeklyOff(d) && awayCount(d) ? awayCount(d) : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  );
}
