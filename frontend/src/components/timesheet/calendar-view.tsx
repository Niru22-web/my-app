"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, X } from "lucide-react";
import { addDays, endOfMonth, fmtDay, startOfMonth, today, weekStart, workDate, type YMD } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { statusOf, type Timelog } from "./api";
import { useDayInfo, type DayInfo } from "./day-info";
import { hhmm } from "./hours";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const STATUS_DOT: Record<string, string> = { draft: "bg-neutral", submitted: "bg-warning", approved: "bg-success", rejected: "bg-danger" };
const STATUS_TEXT: Record<string, string> = { draft: "Draft", submitted: "Awaiting approval", approved: "Approved", rejected: "Returned" };
const MAX_CHIPS = 2;

interface Props {
  month: YMD;
  entries: Timelog[];
  loading: boolean;
  onOpen: (t: Timelog) => void;
  onLog: (d: YMD) => void;
}

/**
 * Month calendar for Time logs: each day lists what was logged ("Job ·· hh:mm" chips, two at most plus "N more"),
 * with holidays, approved leave and weekly offs marked, and a per-week total against the expected hours.
 */
export function CalendarView({ month, entries, loading, onOpen, onLog }: Props) {
  const info = useDayInfo();
  const now = today();
  const first = startOfMonth(month);
  const last = endOfMonth(month);

  const byDay = useMemo(() => {
    const m = new Map<YMD, Timelog[]>();
    for (const e of entries) {
      const d = workDate(e.date);
      m.set(d, [...(m.get(d) ?? []), e]);
    }
    for (const list of m.values()) list.sort((a, b) => b.hours - a.hours);
    return m;
  }, [entries]);

  const weeks = useMemo(() => {
    const out: YMD[][] = [];
    for (let w = weekStart(first); w <= last; w = addDays(w, 7)) out.push(Array.from({ length: 7 }, (_, i) => addDays(w, i)));
    return out;
  }, [first, last]);

  const [more, setMore] = useState<{ day: YMD; rect: DOMRect; trigger: HTMLElement } | null>(null);
  const closeMore = useCallback(() => setMore(null), []);

  if (loading) return <Skeleton className="h-[600px]" />;

  const dayTotal = (d: YMD) => (byDay.get(d) ?? []).reduce((s, e) => s + e.hours, 0);

  return (
    <>
      {/* Desktop / tablet: month grid with a Total column */}
      <Card className="hidden overflow-hidden sm:block">
        <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_84px] border-b border-line bg-surface-muted">
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
              {w}
            </div>
          ))}
          <div className="border-l border-line px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">Total</div>
        </div>
        <div role="grid" aria-label={fmtDay(first, { month: "long", year: "numeric" })}>
          {weeks.map((days) => {
            const inMonth = days.filter((d) => d >= first && d <= last);
            const total = inMonth.reduce((s, d) => s + dayTotal(d), 0);
            const expected = inMonth.reduce((s, d) => s + info.expected(d), 0);
            const expectedToDate = inMonth.filter((d) => d <= now).reduce((s, d) => s + info.expected(d), 0);
            const tone =
              expectedToDate === 0 ? "text-ink" : total >= expectedToDate - 0.001 ? "text-success" : total > 0 ? "text-warning" : "text-danger";
            return (
              <div key={days[0]} role="row" className="grid grid-cols-[repeat(7,minmax(0,1fr))_84px] border-b border-line last:border-b-0">
                {days.map((d) => (
                  <DayCell
                    key={d}
                    day={d}
                    inMonth={d >= first && d <= last}
                    entries={byDay.get(d) ?? []}
                    info={info}
                    onOpen={onOpen}
                    onLog={onLog}
                    onMore={(rect, trigger) => setMore({ day: d, rect, trigger })}
                  />
                ))}
                <div role="gridcell" className="flex flex-col items-center justify-center gap-0.5 border-l border-line bg-surface-muted/50 px-1 py-2 text-center">
                  <span className={cn("font-mono text-sm font-bold tabular", tone)}>{hhmm(total)}</span>
                  <span className="text-[10px] text-ink-subtle">of {hhmm(expected)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Phones: a plain day list */}
      <MobileDayList first={first} last={last} byDay={byDay} info={info} onOpen={onOpen} onLog={onLog} />

      <Legend />

      {more && <MorePopover day={more.day} rect={more.rect} trigger={more.trigger} entries={byDay.get(more.day) ?? []} onOpen={(t) => (setMore(null), onOpen(t))} onClose={closeMore} />}
    </>
  );
}

function DayCell({
  day,
  inMonth,
  entries,
  info,
  onOpen,
  onLog,
  onMore,
}: {
  day: YMD;
  inMonth: boolean;
  entries: Timelog[];
  info: DayInfo;
  onOpen: (t: Timelog) => void;
  onLog: (d: YMD) => void;
  onMore: (rect: DOMRect, trigger: HTMLElement) => void;
}) {
  const now = today();
  const isToday = day === now;
  const holiday = info.holidays.get(day);
  const leave = info.leave.get(day);
  const off = info.isOff(day);
  const loggable = inMonth && info.canLog(day);
  const label = fmtDay(day, { weekday: "long", day: "numeric", month: "long" });
  const total = entries.reduce((s, e) => s + e.hours, 0);

  if (!inMonth) {
    return (
      <div role="gridcell" aria-label={label} className="min-h-[112px] border-r border-line bg-surface-muted/60 p-1.5">
        <span className="text-xs font-semibold tabular text-ink-subtle/60">{Number(day.slice(8))}</span>
      </div>
    );
  }

  const shown = entries.slice(0, MAX_CHIPS);
  const extra = entries.length - shown.length;

  return (
    <div
      role="gridcell"
      aria-label={`${label}${total ? `, ${hhmm(total)} logged` : ""}${holiday ? `, holiday: ${holiday}` : ""}${leave ? `, on leave` : ""}`}
      className={cn(
        "group relative flex min-h-[112px] min-w-0 flex-col gap-1 border-r border-line p-1.5",
        (off || holiday) && "bg-surface-muted/70",
        leave && "bg-brand-softer/60",
        isToday && "bg-brand-softer ring-2 ring-inset ring-brand/50",
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className={cn("grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs font-semibold tabular", isToday ? "bg-brand text-brand-ink" : off ? "text-ink-subtle" : "text-ink")}>
          {Number(day.slice(8))}
        </span>
        {total > 0 && <span className="text-[10px] font-semibold tabular text-ink-muted">{hhmm(total)}</span>}
        {loggable && (
          <button
            type="button"
            onClick={() => onLog(day)}
            className="grid h-6 w-6 place-items-center rounded-md text-brand opacity-0 hover:bg-brand-soft focus:opacity-100 group-hover:opacity-100"
            aria-label={`Log time on ${label}`}
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
      {holiday && (
        <span className="truncate rounded-md bg-danger-soft px-1.5 py-0.5 text-[11px] font-medium text-danger" title={holiday}>
          {holiday}
        </span>
      )}
      {leave && (
        <span className="truncate rounded-md bg-brand-soft px-1.5 py-0.5 text-[11px] font-medium text-brand" title={`On leave · ${leave}`}>
          On leave · {leave}
        </span>
      )}
      {shown.map((e) => (
        <EntryChip key={e.id} entry={e} onOpen={onOpen} />
      ))}
      {extra > 0 && (
        <button
          type="button"
          onClick={(ev) => onMore(ev.currentTarget.getBoundingClientRect(), ev.currentTarget)}
          className="self-start rounded px-1 text-[11px] font-semibold text-brand hover:underline"
          aria-haspopup="dialog"
        >
          {extra} more
        </button>
      )}
    </div>
  );
}

function EntryChip({ entry, onOpen, wide }: { entry: Timelog; onOpen: (t: Timelog) => void; wide?: boolean }) {
  const s = statusOf(entry);
  const name = entry.job?.name ?? "Job";
  return (
    <button
      type="button"
      onClick={() => onOpen(entry)}
      title={`${name} · ${hhmm(entry.hours)} · ${STATUS_TEXT[s]}`}
      aria-label={`${name}, ${hhmm(entry.hours)}, ${STATUS_TEXT[s]}. Open details`}
      className={cn(
        "flex w-full min-w-0 items-center gap-1.5 rounded-md bg-brand-softer px-1.5 py-0.5 text-left text-[11px] text-ink hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-brand",
        wide && "py-1.5 text-[13px]",
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[s])} aria-hidden />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <span className="shrink-0 text-ink-subtle" aria-hidden>
        ··
      </span>
      <span className="shrink-0 font-mono font-semibold tabular">{hhmm(entry.hours)}</span>
    </button>
  );
}

function MorePopover({ day, rect, trigger, entries, onOpen, onClose }: { day: YMD; rect: DOMRect; trigger: HTMLElement; entries: Timelog[]; onOpen: (t: Timelog) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        trigger.focus();
      }
    };
    const onScroll = (e: Event) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose, trigger]);

  const width = 300;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
  const below = window.innerHeight - rect.bottom;
  const style = below > 280 ? { top: rect.bottom + 4 } : { bottom: window.innerHeight - rect.top + 4 };
  const total = entries.reduce((s, e) => s + e.hours, 0);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={`Time logged on ${fmtDay(day, { weekday: "long", day: "numeric", month: "long" })}`}
      style={{ position: "fixed", left, width, ...style }}
      className="z-[60] rounded-xl border border-line bg-surface p-2 shadow-pop"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
        <p className="text-[13px] font-semibold text-ink">
          {fmtDay(day, { weekday: "short", day: "numeric", month: "short" })} · <span className="font-mono tabular">{hhmm(total)}</span>
        </p>
        <button type="button" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-ink-muted hover:bg-surface-muted" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {entries.map((e) => (
          <EntryChip key={e.id} entry={e} onOpen={onOpen} wide />
        ))}
      </div>
    </div>,
    document.body,
  );
}

function MobileDayList({
  first,
  last,
  byDay,
  info,
  onOpen,
  onLog,
}: {
  first: YMD;
  last: YMD;
  byDay: Map<YMD, Timelog[]>;
  info: DayInfo;
  onOpen: (t: Timelog) => void;
  onLog: (d: YMD) => void;
}) {
  const days: YMD[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) days.push(d);
  const now = today();
  return (
    <Card className="divide-y divide-line sm:hidden">
      {days.map((d) => {
        const list = byDay.get(d) ?? [];
        const holiday = info.holidays.get(d);
        const leave = info.leave.get(d);
        const off = info.isOff(d);
        const total = list.reduce((s, e) => s + e.hours, 0);
        return (
          <div key={d} className={cn("px-3 py-2.5", (off || holiday) && "bg-surface-muted/70", d === now && "bg-brand-softer")}>
            <div className="flex items-center justify-between gap-2">
              <p className={cn("text-[13px] font-semibold", d === now ? "text-brand" : off ? "text-ink-subtle" : "text-ink")}>
                {fmtDay(d, { weekday: "short", day: "numeric", month: "short" })}
                {holiday && <span className="ml-2 rounded bg-danger-soft px-1.5 py-0.5 text-[11px] font-medium text-danger">{holiday}</span>}
                {leave && <span className="ml-2 rounded bg-brand-soft px-1.5 py-0.5 text-[11px] font-medium text-brand">On leave · {leave}</span>}
              </p>
              <span className="flex items-center gap-1">
                {total > 0 && <span className="font-mono text-xs font-semibold tabular text-ink">{hhmm(total)}</span>}
                {info.canLog(d) && (
                  <button type="button" onClick={() => onLog(d)} className="grid h-7 w-7 place-items-center rounded-md text-brand hover:bg-brand-soft" aria-label={`Log time on ${fmtDay(d)}`}>
                    <Plus className="h-4 w-4" />
                  </button>
                )}
              </span>
            </div>
            {list.length > 0 && (
              <div className="mt-1.5 space-y-1">
                {list.map((e) => (
                  <EntryChip key={e.id} entry={e} onOpen={onOpen} wide />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
      {Object.entries(STATUS_TEXT).map(([k, l]) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[k])} aria-hidden /> {l}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm border border-line bg-surface-muted" aria-hidden /> Weekly off / holiday
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm bg-brand-soft" aria-hidden /> Leave
      </span>
      <span className="text-ink-subtle">· Week totals turn green once the expected hours are met.</span>
    </div>
  );
}
