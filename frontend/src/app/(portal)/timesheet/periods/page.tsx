"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CalendarRange, Eye, Send } from "lucide-react";
import { ApiError } from "@/lib/api";
import { addDays, fmtDay, today, weekStart, workDate, type YMD } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, useDialogState } from "@/components/ui/confirm";
import { DataTable, type Column } from "@/components/ui/data-table";
import { useToast } from "@/components/ui/toast";
import { statusOf, useMyTimelogs, useTimelogMutations, type Timelog } from "@/components/timesheet/api";
import { useDayInfo } from "@/components/timesheet/day-info";
import { hhmm } from "@/components/timesheet/hours";

type Overall = "none" | "not_submitted" | "partly" | "awaiting" | "approved" | "returned";

const OVERALL: Record<Overall, { label: string; tone: "neutral" | "warning" | "success" | "danger" | "brand" }> = {
  none: { label: "No time logged", tone: "neutral" },
  not_submitted: { label: "Not submitted", tone: "neutral" },
  partly: { label: "Partly submitted", tone: "brand" },
  awaiting: { label: "Awaiting approval", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  returned: { label: "Returned", tone: "danger" },
};

interface WeekRow {
  from: YMD;
  to: YMD;
  total: number;
  expected: number;
  billable: number;
  draft: number;
  submitted: number;
  approved: number;
  returned: number;
  overall: Overall;
  openEntries: Timelog[];
}

const WEEKS = 13; // current + the last 12

/** One row per week (current + the last 12) with its hours and submission status. */
export default function TimesheetsPage() {
  const toast = useToast();
  const info = useDayInfo();
  const m = useTimelogMutations();
  const submitWeek = useDialogState<WeekRow>();
  const thisWeek = weekStart(today());
  const first = addDays(thisWeek, -7 * (WEEKS - 1));
  const q = useMyTimelogs({ dateFrom: first, dateTo: addDays(thisWeek, 6) });

  const rows = useMemo<WeekRow[]>(() => {
    const out: WeekRow[] = [];
    for (let i = 0; i < WEEKS; i++) {
      const from = addDays(thisWeek, -7 * i);
      const to = addDays(from, 6);
      const list = (q.data ?? []).filter((e) => workDate(e.date) >= from && workDate(e.date) <= to);
      const c = { draft: 0, submitted: 0, approved: 0, rejected: 0 };
      for (const e of list) c[statusOf(e)]++;
      let expected = 0;
      for (let d = from; d <= to; d = addDays(d, 1)) expected += info.expected(d);
      const overall: Overall = !list.length
        ? "none"
        : c.rejected
          ? "returned"
          : c.approved === list.length
            ? "approved"
            : !c.draft
              ? "awaiting"
              : c.submitted || c.approved
                ? "partly"
                : "not_submitted";
      out.push({
        from,
        to,
        total: list.reduce((s, e) => s + e.hours, 0),
        expected,
        billable: list.filter((e) => e.billableStatus !== "non_billable").reduce((s, e) => s + e.hours, 0),
        draft: c.draft,
        submitted: c.submitted,
        approved: c.approved,
        returned: c.rejected,
        overall,
        openEntries: list.filter((e) => ["draft", "rejected"].includes(statusOf(e))),
      });
    }
    return out;
  }, [q.data, thisWeek, info]);

  const label = (r: WeekRow) => `${fmtDay(r.from, { day: "numeric", month: "short" })} – ${fmtDay(r.to, { day: "numeric", month: "short", year: "numeric" })}`;
  const count = (n: number, cls = "text-ink") => <span className={n ? `font-semibold tabular ${cls}` : "tabular text-ink-subtle"}>{n}</span>;

  const columns: Column<WeekRow>[] = [
    {
      key: "week",
      header: "Week",
      cell: (r) => (
        <span className="whitespace-nowrap font-medium text-ink">
          {label(r)}
          {r.from === thisWeek && <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold uppercase text-brand-ink">This week</span>}
        </span>
      ),
      sortValue: (r) => r.from,
      exportValue: (r) => label(r),
    },
    {
      key: "total",
      header: "Total hours",
      align: "right",
      cell: (r) => <span className={`font-mono font-semibold ${r.expected && r.total < r.expected && r.from < thisWeek ? "text-warning" : "text-ink"}`}>{hhmm(r.total)}</span>,
      sortValue: (r) => r.total,
      exportValue: (r) => Math.round(r.total * 100) / 100,
    },
    { key: "expected", header: "Expected hours", align: "right", cell: (r) => <span className="font-mono text-ink-muted">{hhmm(r.expected)}</span>, sortValue: (r) => r.expected, hideBelow: "lg" },
    { key: "billable", header: "Billable hours", align: "right", cell: (r) => <span className="font-mono">{hhmm(r.billable)}</span>, sortValue: (r) => r.billable, hideBelow: "lg", exportValue: (r) => Math.round(r.billable * 100) / 100 },
    {
      key: "counts",
      header: (
        <span className="leading-4">
          Draft / Submitted /
          <br />
          Approved / Returned
        </span>
      ),
      exportHeader: "Draft / Submitted / Approved / Returned",
      align: "center",
      cell: (r) => (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap" aria-label={`${r.draft} draft, ${r.submitted} submitted, ${r.approved} approved, ${r.returned} returned`}>
          {count(r.draft)}
          <span className="text-ink-subtle">/</span>
          {count(r.submitted, "text-warning")}
          <span className="text-ink-subtle">/</span>
          {count(r.approved, "text-success")}
          <span className="text-ink-subtle">/</span>
          {count(r.returned, "text-danger")}
        </span>
      ),
      sortValue: (r) => r.draft + r.returned,
      exportValue: (r) => `${r.draft} / ${r.submitted} / ${r.approved} / ${r.returned}`,
      hideBelow: "md",
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => <Badge tone={OVERALL[r.overall].tone} className="whitespace-nowrap">{OVERALL[r.overall].label}</Badge>,
      sortValue: (r) => OVERALL[r.overall].label,
    },
    {
      key: "actions",
      header: "",
      cell: (r) => (
        <span className="flex justify-end gap-1.5">
          <Link
            href={`/timesheet?view=list&span=week&date=${r.from}`}
            title="View this week in Time logs"
            aria-label={`View ${label(r)} in Time logs`}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2 text-[13px] font-medium text-ink hover:bg-surface-muted"
          >
            <Eye className="h-4 w-4" />
            <span className="hidden 2xl:inline">View</span>
          </Link>
          <Button size="sm" onClick={() => submitWeek.show(r)} disabled={!r.openEntries.length} title={r.openEntries.length ? undefined : "Nothing to submit in this week"}>
            <Send className="h-4 w-4" /> Submit week
          </Button>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Timesheets" description="Your time week by week — what’s been submitted, approved or returned, and what still needs submitting." />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.from}
        loading={q.isLoading}
        error={q.isError}
        onRetry={() => q.refetch()}
        pageSize={13}
        pageSizeOptions={[13]}
        exportName="my-timesheets"
        itemsLabel="weeks"
        empty={{ icon: CalendarRange, title: "No weeks to show" }}
      />
      <ConfirmDialog
        open={submitWeek.open}
        onClose={submitWeek.close}
        title="Submit this week?"
        confirmLabel="Submit for approval"
        busy={m.submitMany.isPending}
        description={
          submitWeek.value
            ? `${submitWeek.value.openEntries.length} draft or returned entr${submitWeek.value.openEntries.length === 1 ? "y" : "ies"} (${hhmm(
                submitWeek.value.openEntries.reduce((s, e) => s + e.hours, 0),
              )}) for ${label(submitWeek.value)} will be sent to your reviewer.`
            : undefined
        }
        onConfirm={() =>
          submitWeek.value &&
          m.submitMany.mutate(
            submitWeek.value.openEntries.map((e) => e.id),
            {
              onSuccess: (r) => (toast.success("Week submitted", `${r.data?.count ?? 0} entries sent for approval`), submitWeek.close()),
              onError: (e) => toast.error("Couldn’t submit", e instanceof ApiError ? e.message : undefined),
            },
          )
        }
      />
    </div>
  );
}
