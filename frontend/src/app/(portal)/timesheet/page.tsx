"use client";

import { useMemo, useState } from "react";
import { CalendarRange, ChevronLeft, ChevronRight, ClipboardList, Plus, Send } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { addDays, endOfMonth, fmtDay, fmtRange, startOfMonth, today, weekDays, weekStart, workDate, type YMD } from "@/lib/dates";
import { formatHours } from "@/lib/format";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { ConfirmDialog, useDialogState } from "@/components/ui/confirm";
import { Input } from "@/components/ui/inputs";
import { useToast } from "@/components/ui/toast";
import { isPrivileged, statusOf, useMyTimelogs, useTimelogMutations, type Timelog } from "@/components/timesheet/api";
import { EntryDialog } from "@/components/timesheet/entry-dialog";
import { EntryRow } from "@/components/timesheet/entry-row";
import { WeekSummary } from "@/components/timesheet/week-summary";
import { MonthCalendar } from "@/components/timesheet/month-calendar";
import { ExcelMenu } from "@/components/timesheet/excel-menu";
import { WeekGrid } from "@/components/timesheet/week-grid";

type Mode = "grid" | "week" | "month" | "range";
type StatusFilter = "all" | "draft" | "submitted" | "approved" | "rejected";

export default function MyTimesheetPage() {
  const { user } = useAuth();
  const toast = useToast();
  const privileged = isPrivileged(user?.role);

  const [mode, setMode] = useState<Mode>("month");
  const [anchor, setAnchor] = useState<YMD>(() => weekStart(today()));
  const [monthAnchor, setMonthAnchor] = useState<YMD>(() => startOfMonth(today()));
  const [rangeFrom, setRangeFrom] = useState<YMD>(() => startOfMonth(today()));
  const [rangeTo, setRangeTo] = useState<YMD>(() => today());
  const [selectedDay, setSelectedDay] = useState<YMD | null>(null);
  const [status, setStatus] = useState<StatusFilter>("all");

  const [editor, setEditor] = useState<{ entry?: Timelog | null; date?: YMD } | null>(null);
  const del = useDialogState<Timelog>();
  const [confirmSubmitAll, setConfirmSubmitAll] = useState(false);

  const days = useMemo(() => weekDays(anchor), [anchor]);
  const filters =
    mode === "week" || mode === "grid" ? { dateFrom: days[0], dateTo: days[6] } : mode === "month" ? { dateFrom: monthAnchor, dateTo: endOfMonth(monthAnchor) } : { dateFrom: rangeFrom, dateTo: rangeTo };
  const q = useMyTimelogs(filters);
  const m = useTimelogMutations();

  const all = useMemo(() => q.data ?? [], [q.data]);
  const visible = all.filter(
    (e) => (status === "all" || statusOf(e) === status) && (mode === "range" || !selectedDay || workDate(e.date) === selectedDay),
  );
  const drafts = all.filter((e) => statusOf(e) === "draft");

  // Group visible entries by day, newest first.
  const groups = useMemo(() => {
    const map = new Map<YMD, Timelog[]>();
    for (const e of visible) {
      const d = workDate(e.date);
      map.set(d, [...(map.get(d) ?? []), e]);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [visible]);

  const err = (title: string) => (e: unknown) => toast.error(title, e instanceof ApiError ? e.message : undefined);
  const rowActions = {
    onEdit: (t: Timelog) => setEditor({ entry: t }),
    onDelete: (t: Timelog) => del.show(t),
    onSubmit: (t: Timelog) =>
      m.submit.mutate(t.id, { onSuccess: () => toast.success("Submitted for approval"), onError: err("Couldn’t submit") }),
  };

  const isCurrentWeek = anchor === weekStart(today());

  return (
    <div className="space-y-6">
      <PageHeader
        title="My timesheet"
        description="Log your hours against client jobs and submit them for approval."
        actions={
          <>
            <ExcelMenu exportQuery={filters} />
            {drafts.length > 0 && (
              <Button variant="secondary" onClick={() => setConfirmSubmitAll(true)}>
                <Send className="h-4 w-4" /> Submit {drafts.length} draft{drafts.length > 1 ? "s" : ""}
              </Button>
            )}
            <Button onClick={() => setEditor({ date: selectedDay && selectedDay <= today() ? selectedDay : today() })}>
              <Plus className="h-4 w-4" /> Log time
            </Button>
          </>
        }
      />

      {/* Period controls */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            aria-label="View"
            value={mode}
            onChange={(v) => {
              setMode(v);
              setSelectedDay(null);
            }}
            options={[
              { value: "grid", label: "Week grid" },
              { value: "week", label: "Week" },
              { value: "month", label: "Month" },
              { value: "range", label: "Date range" },
            ]}
          />
          {mode === "week" || mode === "grid" ? (
            <div className="flex items-center gap-1">
              <button onClick={() => (setAnchor(addDays(anchor, -7)), setSelectedDay(null))} className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-surface hover:bg-surface-muted" aria-label="Previous week">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[180px] px-2 text-center text-sm font-semibold text-ink">{fmtRange(days[0], days[6])}</span>
              <button
                onClick={() => (setAnchor(addDays(anchor, 7)), setSelectedDay(null))}
                disabled={isCurrentWeek}
                className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-surface hover:bg-surface-muted disabled:opacity-40"
                aria-label="Next week"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              {!isCurrentWeek && (
                <Button variant="ghost" size="sm" onClick={() => (setAnchor(weekStart(today())), setSelectedDay(null))}>
                  This week
                </Button>
              )}
            </div>
          ) : mode === "month" ? (
            <div className="flex items-center gap-1">
              <button onClick={() => (setMonthAnchor(startOfMonth(addDays(monthAnchor, -1))), setSelectedDay(null))} className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-surface hover:bg-surface-muted" aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[150px] px-2 text-center text-sm font-semibold text-ink">{fmtDay(monthAnchor, { month: "long", year: "numeric" })}</span>
              <button
                onClick={() => (setMonthAnchor(startOfMonth(addDays(endOfMonth(monthAnchor), 1))), setSelectedDay(null))}
                disabled={monthAnchor === startOfMonth(today())}
                className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-surface hover:bg-surface-muted disabled:opacity-40"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              {monthAnchor !== startOfMonth(today()) && (
                <Button variant="ghost" size="sm" onClick={() => (setMonthAnchor(startOfMonth(today())), setSelectedDay(null))}>
                  This month
                </Button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Input type="date" aria-label="From" value={rangeFrom} max={rangeTo} onChange={(e) => e.target.value && setRangeFrom(e.target.value)} className="h-9 w-[150px]" />
              <span className="text-ink-subtle">to</span>
              <Input type="date" aria-label="To" value={rangeTo} min={rangeFrom} max={today()} onChange={(e) => e.target.value && setRangeTo(e.target.value)} className="h-9 w-[150px]" />
            </div>
          )}
        </div>

        <Segmented
          aria-label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "All" },
            { value: "draft", label: "Draft" },
            { value: "submitted", label: "Awaiting" },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Returned" },
          ]}
        />
      </div>

      {mode === "grid" && <WeekGrid key={days[0]} days={days} entries={all} loading={q.isLoading} />}
      {mode === "week" && <WeekSummary days={days} entries={all} loading={q.isLoading} selected={selectedDay} onSelect={setSelectedDay} />}
      {mode === "month" && (
        <MonthCalendar month={monthAnchor} entries={all} loading={q.isLoading} selected={selectedDay} onSelect={setSelectedDay} onLog={(d) => setEditor({ date: d })} />
      )}
      {mode === "month" && selectedDay && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-ink">{fmtDay(selectedDay, { weekday: "long", day: "numeric", month: "long" })}</p>
          <span className="flex gap-2">
            {selectedDay <= today() && (
              <Button size="sm" onClick={() => setEditor({ date: selectedDay })}>
                <Plus className="h-4 w-4" /> Log time for this day
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setSelectedDay(null)}>
              Show whole month
            </Button>
          </span>
        </div>
      )}

      {mode === "range" && !q.isLoading && (
        <p className="text-sm text-ink-muted">
          <span className="font-semibold text-ink tabular">{formatHours(visible.reduce((a, e) => a + e.hours, 0))}</span> across {visible.length} entr
          {visible.length === 1 ? "y" : "ies"}
        </p>
      )}

      {/* Entries */}
      {mode === "grid" ? null : q.isLoading ? (
        <Card className="space-y-3 p-5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </Card>
      ) : q.isError ? (
        <Card>
          <ErrorState message={q.error instanceof ApiError ? q.error.message : undefined} onRetry={() => q.refetch()} />
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={mode === "week" ? CalendarRange : ClipboardList}
            title={selectedDay ? `Nothing logged on ${fmtDay(selectedDay, { weekday: "long", day: "numeric", month: "short" })}` : status !== "all" ? "No entries match this filter" : "No time logged for this period"}
            description={status === "all" ? "Use “Log time” to add your first entry." : undefined}
            action={
              status === "all" && (!selectedDay || selectedDay <= today()) ? (
                <Button size="sm" onClick={() => setEditor({ date: selectedDay ?? today() })}>
                  <Plus className="h-4 w-4" /> Log time
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map(([day, items]) => {
            const total = items.reduce((a, e) => a + e.hours, 0);
            return (
              <Card key={day} className="overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-muted px-4 py-2.5">
                  <p className="text-sm font-semibold text-ink">
                    {fmtDay(day, { weekday: "long", day: "numeric", month: "long" })}
                    {day === today() && <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold uppercase text-brand-ink">Today</span>}
                  </p>
                  <div className="flex items-center gap-3">
                    <span className={cn("text-sm font-bold tabular", total > 12 ? "text-warning" : "text-ink")}>{formatHours(total)}</span>
                    <button onClick={() => setEditor({ date: day })} className="grid h-7 w-7 place-items-center rounded-lg text-brand hover:bg-brand-soft" aria-label={`Log time on ${day}`}>
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <ul className="divide-y divide-line">
                  {items.map((e) => (
                    <EntryRow key={e.id} entry={e} privileged={privileged} actions={rowActions} />
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}

      <EntryDialog open={!!editor} onClose={() => setEditor(null)} entry={editor?.entry} defaultDate={editor?.date} />

      <ConfirmDialog
        open={del.open}
        onClose={del.close}
        tone="danger"
        title="Delete this entry?"
        confirmLabel="Delete"
        busy={m.remove.isPending}
        description={del.value ? `${formatHours(del.value.hours)} on ${fmtDay(workDate(del.value.date))} for ${del.value.job?.project?.name ?? "this job"} will be removed. This can’t be undone.` : undefined}
        onConfirm={() =>
          del.value &&
          m.remove.mutate(del.value.id, {
            onSuccess: () => (toast.success("Entry deleted"), del.close()),
            onError: err("Couldn’t delete"),
          })
        }
      />

      <ConfirmDialog
        open={confirmSubmitAll}
        onClose={() => setConfirmSubmitAll(false)}
        title={`Submit ${drafts.length} draft entr${drafts.length === 1 ? "y" : "ies"}?`}
        confirmLabel="Submit for approval"
        busy={m.submitMany.isPending}
        description={`${formatHours(drafts.reduce((a, e) => a + e.hours, 0))} in total will be sent to your reviewer. You can still edit entries while they await approval.`}
        onConfirm={() =>
          m.submitMany.mutate(
            drafts.map((d) => d.id),
            {
              onSuccess: (r) => (toast.success("Submitted for approval", `${r.data?.count ?? drafts.length} entries sent`), setConfirmSubmitAll(false)),
              onError: err("Couldn’t submit"),
            },
          )
        }
      />
    </div>
  );
}
