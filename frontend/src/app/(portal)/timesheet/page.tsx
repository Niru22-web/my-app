"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { addDays, fmtDay, today, workDate, type YMD } from "@/lib/dates";
import { useLocalValue, writeLocal } from "@/lib/local-store";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/empty-state";
import { ConfirmDialog, useDialogState } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { isPrivileged, statusOf, useGridMutations, useMyTimelogs, useTimelogMutations, type Timelog } from "@/components/timesheet/api";
import { EntryDialog } from "@/components/timesheet/entry-dialog";
import { EntryDetailDialog } from "@/components/timesheet/entry-detail";
import { CalendarView } from "@/components/timesheet/calendar-view";
import { ListView } from "@/components/timesheet/list-view";
import { TimeGrid } from "@/components/timesheet/week-grid";
import { DailyLog } from "@/components/timesheet/daily-log";
import { ExcelMenu } from "@/components/timesheet/excel-menu";
import { TimerBar, TimerIndicator } from "@/components/timesheet/timer";
import { FilterDrawer, NO_FILTERS, activeFilterCount, applyFilters, type TimeFilters } from "@/components/timesheet/filter-drawer";
import { hhmm } from "@/components/timesheet/hours";
import {
  FilterButton,
  LogTimeButton,
  PeriodNav,
  SummaryFooter,
  ViewSwitch,
  periodLabel,
  periodOf,
  shiftPeriod,
  type LogAction,
  type Period,
} from "@/components/timesheet/toolbar";

type View = "list" | "calendar";
type GridKind = "day" | "week" | "semi" | "month";
const VIEW_KEY = "asa:timelogs-view";
const GRID_TITLE: Record<GridKind, string> = { day: "Daily log", week: "Weekly log", semi: "Semi-monthly log", month: "Monthly log" };
const GRID_UNIT: Record<GridKind, string> = { day: "day", week: "week", semi: "half-month", month: "month" };

export default function TimeLogsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <TimeLogs />
    </Suspense>
  );
}

const isYmd = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

function TimeLogs() {
  const params = useSearchParams();
  const { user } = useAuth();
  const toast = useToast();
  const privileged = isPrivileged(user?.role);

  // ?view=list&span=week&date=YYYY-MM-DD (used by the Timesheets tab's "View") wins over the remembered view.
  const urlView = params.get("view");
  const urlDate = params.get("date");
  const pref = useLocalValue(VIEW_KEY);
  const [viewChoice, setViewChoice] = useState<View | null>(urlView === "list" || urlView === "calendar" ? urlView : null);
  const view: View = viewChoice ?? (pref === "list" ? "list" : "calendar");
  const [listSpan, setListSpan] = useState<"week" | "month">(params.get("span") === "month" ? "month" : "week");
  const [anchor, setAnchor] = useState<YMD>(isYmd(urlDate) ? urlDate : today());
  const [grid, setGrid] = useState<{ kind: GridKind; anchor: YMD } | null>(null);
  const [filters, setFilters] = useState<TimeFilters>(NO_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);

  const [editor, setEditor] = useState<{ entry?: Timelog | null; date?: YMD; timer?: boolean } | null>(null);
  const [detail, setDetail] = useState<Timelog | null>(null);
  const del = useDialogState<Timelog>();
  const bulkDel = useDialogState<Timelog[]>();
  const submitAll = useDialogState<Timelog[]>();

  const period: Period = grid ? periodOf(grid.kind, grid.anchor) : periodOf(view === "calendar" ? "month" : listSpan, anchor);
  const q = useMyTimelogs({ dateFrom: period.from, dateTo: period.to });
  const m = useTimelogMutations();
  const { removeMany } = useGridMutations();

  const all = useMemo(() => q.data ?? [], [q.data]);
  const visible = useMemo(() => applyFilters(all, filters), [all, filters]);
  const nFilters = activeFilterCount(filters);

  const setView = (v: View) => {
    setViewChoice(v);
    writeLocal(VIEW_KEY, v);
  };
  const changePeriod = (p: Period) => (grid ? setGrid({ ...grid, anchor: p.from }) : setAnchor(p.from));

  const err = (title: string) => (e: unknown) => toast.error(title, e instanceof ApiError ? e.message : undefined);
  const submitOne = (t: Timelog) =>
    m.submit.mutate(t.id, { onSuccess: () => (toast.success("Submitted for approval"), setDetail(null)), onError: err("Couldn’t submit") });

  function onLogAction(a: LogAction) {
    const base = grid ? grid.anchor : view === "calendar" && anchor.slice(0, 7) !== today().slice(0, 7) ? period.from : today();
    if (a === "single") setEditor({ date: today() });
    else if (a === "timer") setEditor({ date: today(), timer: true });
    else setGrid({ kind: a, anchor: a === "day" ? today() : base });
  }

  const previousOf = (p: Period) => {
    const prev = shiftPeriod(p, -1);
    return { from: prev.from, to: prev.to };
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={grid ? GRID_TITLE[grid.kind] : "Time logs"}
        description={
          grid
            ? grid.kind === "day"
              ? "Add several entries for one day and save them together as drafts."
              : "Type hours into the grid — each cell is your draft time for that job and day."
            : "Log your hours against client jobs and submit them for approval."
        }
        actions={
          <>
            <TimerIndicator />
            <ExcelMenu exportQuery={{ dateFrom: period.from, dateTo: period.to }} />
            <LogTimeButton onAction={onLogAction} />
          </>
        }
      />

      {!grid && <TimerBar />}

      {/* Period and view controls */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {grid && (
            <Button variant="ghost" size="sm" onClick={() => setGrid(null)}>
              <ArrowLeft className="h-4 w-4" /> Back to time logs
            </Button>
          )}
          <PeriodNav period={period} onChange={changePeriod} />
          {!grid && view === "list" && (
            <Segmented
              aria-label="Period"
              value={listSpan}
              onChange={setListSpan}
              options={[
                { value: "week", label: "Week" },
                { value: "month", label: "Month" },
              ]}
            />
          )}
        </div>
        {!grid && (
          <div className="flex items-center gap-2">
            <ViewSwitch value={view} onChange={setView} />
            <FilterButton count={nFilters} onClick={() => setFilterOpen(true)} />
          </div>
        )}
      </div>

      {!grid && nFilters > 0 && (
        <p className="text-xs text-ink-muted">
          Showing {visible.length} of {all.length} entries in {periodLabel(period)}.{" "}
          <button type="button" className="font-semibold text-brand hover:underline" onClick={() => setFilters(NO_FILTERS)}>
            Clear filters
          </button>
        </p>
      )}

      {q.isError ? (
        <Card>
          <ErrorState error={q.error} message={q.error instanceof ApiError ? q.error.message : undefined} onRetry={() => q.refetch()} />
        </Card>
      ) : grid ? (
        grid.kind === "day" ? (
          <DailyLog key={period.from} day={period.from} entries={all} loading={q.isLoading} />
        ) : (
          <TimeGrid
            key={`${grid.kind}-${period.from}`}
            days={daysOf(period)}
            entries={all}
            loading={q.isLoading}
            previous={previousOf(period)}
            periodName={GRID_UNIT[grid.kind]}
          />
        )
      ) : view === "calendar" ? (
        <CalendarView month={period.from} entries={visible} loading={q.isLoading} onOpen={setDetail} onLog={(d) => setEditor({ date: d })} />
      ) : (
        <ListView
          key={period.from + listSpan}
          entries={visible}
          loading={q.isLoading}
          privileged={privileged}
          filtered={nFilters > 0}
          onOpen={setDetail}
          onEdit={(t) => setEditor({ entry: t })}
          onDelete={del.show}
          onSubmit={submitOne}
          onLog={(d) => setEditor({ date: d ?? today() })}
          onBulkSubmit={(rows) =>
            m.submitMany.mutate(
              rows.map((r) => r.id),
              { onSuccess: (r) => toast.success("Submitted for approval", `${r.data?.count ?? rows.length} entries sent`), onError: err("Couldn’t submit") },
            )
          }
          onBulkDelete={bulkDel.show}
        />
      )}

      {!grid && !q.isLoading && !q.isError && (
        <SummaryFooter entries={visible} onSubmitDrafts={() => submitAll.show(visible.filter((e) => ["draft", "rejected"].includes(statusOf(e))))} />
      )}

      <FilterDrawer open={filterOpen} value={filters} entries={all} onApply={setFilters} onClose={() => setFilterOpen(false)} />

      <EntryDetailDialog
        entry={detail}
        privileged={privileged}
        onClose={() => setDetail(null)}
        onEdit={(t) => (setDetail(null), setEditor({ entry: t }))}
        onDelete={(t) => (setDetail(null), del.show(t))}
        onSubmit={submitOne}
      />

      <EntryDialog open={!!editor} onClose={() => setEditor(null)} entry={editor?.entry} defaultDate={editor?.date} startWithTimer={editor?.timer} />

      <ConfirmDialog
        open={del.open}
        onClose={del.close}
        tone="danger"
        title="Delete time log?"
        confirmLabel="Delete"
        busy={m.remove.isPending}
        description={
          del.value
            ? `It will be deleted permanently — ${hhmm(del.value.hours)} on ${fmtDay(workDate(del.value.date))} for ${del.value.job?.name ?? "this job"}.`
            : undefined
        }
        onConfirm={() =>
          del.value &&
          m.remove.mutate(del.value.id, {
            onSuccess: () => (toast.success("Time log deleted"), del.close()),
            onError: err("Couldn’t delete"),
          })
        }
      />

      <ConfirmDialog
        open={bulkDel.open}
        onClose={bulkDel.close}
        tone="danger"
        title={`Delete ${bulkDel.value?.length ?? 0} time log${bulkDel.value?.length === 1 ? "" : "s"}?`}
        confirmLabel="Delete"
        busy={removeMany.isPending}
        description="They will be deleted permanently. Only drafts and returned entries are deleted; submitted and approved time stays."
        onConfirm={() =>
          bulkDel.value &&
          removeMany.mutate(
            bulkDel.value.map((r) => r.id),
            {
              onSuccess: (r) => {
                if (r.failed.length) toast.error(`${r.done} deleted, ${r.failed.length} couldn’t be`, r.failed[0]);
                else toast.success(`${r.done} time log${r.done === 1 ? "" : "s"} deleted`);
                bulkDel.close();
              },
            },
          )
        }
      />

      <ConfirmDialog
        open={submitAll.open}
        onClose={submitAll.close}
        title={`Submit ${submitAll.value?.length ?? 0} entr${submitAll.value?.length === 1 ? "y" : "ies"} for approval?`}
        confirmLabel="Submit for approval"
        busy={m.submitMany.isPending}
        description={`All drafts and returned entries in ${periodLabel(period)}${nFilters ? " that match the filters" : ""} — ${hhmm(
          (submitAll.value ?? []).reduce((a, e) => a + e.hours, 0),
        )} in total — will be sent to your reviewer.`}
        onConfirm={() =>
          submitAll.value &&
          m.submitMany.mutate(
            submitAll.value.map((d) => d.id),
            {
              onSuccess: (r) => (toast.success("Submitted for approval", `${r.data?.count ?? 0} entries sent`), submitAll.close()),
              onError: err("Couldn’t submit"),
            },
          )
        }
      />
    </div>
  );
}

function daysOf(p: Period): YMD[] {
  const out: YMD[] = [];
  for (let d = p.from; d <= p.to; d = addDays(d, 1)) out.push(d);
  return out;
}
