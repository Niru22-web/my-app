"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { addDays, fmtDay, startOfMonth, endOfMonth, today, weekStart, type YMD } from "@/lib/dates";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Monday-first month grid. Each day cell's content is supplied by `renderDay`. */
export function MonthGrid({
  month,
  renderDay,
  onSelect,
  selected,
  className,
}: {
  /** Any date inside the month to show. */
  month: YMD;
  renderDay: (ymd: YMD, inMonth: boolean) => ReactNode;
  onSelect?: (ymd: YMD) => void;
  selected?: YMD | null;
  className?: string;
}) {
  const first = startOfMonth(month);
  const last = endOfMonth(month);
  const gridStart = weekStart(first);
  const cells: YMD[] = [];
  for (let d = gridStart; d <= last || cells.length % 7 !== 0; d = addDays(d, 1)) cells.push(d);
  const now = today();

  return (
    <div className={cn("overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface", className)}>
      <div className="grid grid-cols-7 border-b border-line bg-surface-muted">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={cn("px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-subtle", i >= 5 && "text-ink-subtle/70")}>
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7" role="grid" aria-label={fmtDay(first, { month: "long", year: "numeric" })}>
        {cells.map((d, i) => {
          const inMonth = d >= first && d <= last;
          const isToday = d === now;
          const isSel = selected === d;
          const Tag = onSelect && inMonth ? "button" : "div";
          return (
            <Tag
              key={d}
              role="gridcell"
              aria-selected={isSel || undefined}
              aria-label={fmtDay(d, { weekday: "long", day: "numeric", month: "long" })}
              onClick={onSelect && inMonth ? () => onSelect(d) : undefined}
              className={cn(
                "relative flex min-h-[76px] flex-col items-stretch border-b border-r border-line p-1.5 text-left sm:min-h-[96px] sm:p-2",
                (i + 1) % 7 === 0 && "border-r-0",
                !inMonth && "bg-surface-muted/60",
                onSelect && inMonth && "hover:bg-brand-softer",
                isSel && "ring-2 ring-inset ring-brand",
              )}
            >
              <span
                className={cn(
                  "grid h-6 w-6 place-items-center rounded-full text-xs font-semibold tabular",
                  isToday ? "bg-brand text-brand-ink" : inMonth ? "text-ink" : "text-ink-subtle/60",
                )}
              >
                {Number(d.slice(8))}
              </span>
              <div className="mt-1 flex-1">{renderDay(d, inMonth)}</div>
            </Tag>
          );
        })}
      </div>
    </div>
  );
}
