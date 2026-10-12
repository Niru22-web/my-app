"use client";

import { useState } from "react";
import { CalendarCheck2, CalendarMinus, CalendarPlus, Pencil, Plus, Scale, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { fmtDay, workDate } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ConfirmDialog, useDialogState } from "@/components/ui/confirm";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { leaveState, personName, useLeaveBalance, useLeaveMutations, useLeaves, type Leave, type LeaveState } from "@/components/leave/api";
import { ApplyLeaveDialog } from "@/components/leave/apply-dialog";
import { LeaveBadge } from "@/components/leave/leave-badge";
import { LeaveTabs } from "@/components/leave/leave-tabs";

export default function MyLeavePage() {
  const { user } = useAuth();
  const toast = useToast();
  const [filter, setFilter] = useState<"all" | LeaveState>("all");
  const [editor, setEditor] = useState<{ entry?: Leave | null } | null>(null);
  const cancel = useDialogState<Leave>();

  const balance = useLeaveBalance(user?.id);
  const leaves = useLeaves({ employeeId: user?.id }, !!user);
  const m = useLeaveMutations();

  const mine = (leaves.data ?? []).filter((l) => l.employeeId === user?.id);
  const rows = mine.filter((l) => filter === "all" || leaveState(l) === filter);
  const b = balance.data;
  const fy = b ? `FY ${b.financialYearStart.slice(0, 4)}–${b.financialYearEnd.slice(2, 4)}` : undefined;

  const columns: Column<Leave>[] = [
    { key: "id", header: "Request", sortValue: (l) => l.leaveId, cell: (l) => <span className="font-medium text-ink">{l.leaveId}</span> },
    { key: "type", header: "Type", sortValue: (l) => l.type, cell: (l) => l.type },
    {
      key: "dates",
      header: "Dates",
      sortValue: (l) => workDate(l.fromDate),
      cell: (l) => {
        const f = workDate(l.fromDate);
        const t = workDate(l.toDate);
        return <span className="whitespace-nowrap">{f === t ? fmtDay(f) : `${fmtDay(f, { day: "numeric", month: "short" })} – ${fmtDay(t)}`}</span>;
      },
    },
    { key: "days", header: "Days", align: "right", sortValue: (l) => l.totalDays, cell: (l) => <span className="font-semibold">{l.totalDays}</span> },
    { key: "reason", header: "Reason", hideBelow: "lg", cell: (l) => <span className="line-clamp-1 max-w-[260px] text-ink-muted">{l.reason}</span> },
    {
      key: "status",
      header: "Status",
      sortValue: (l) => l.status,
      cell: (l) => (
        <div>
          <LeaveBadge leave={l} />
          {l.approver && leaveState(l) !== "pending" && leaveState(l) !== "cancelled" && (
            <p className="mt-0.5 text-[11px] text-ink-subtle">by {personName(l.approver)}</p>
          )}
        </div>
      ),
    },
    { key: "applied", header: "Applied", hideBelow: "md", sortValue: (l) => l.appliedDate, cell: (l) => <span className="text-ink-muted">{formatDate(l.appliedDate)}</span> },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (l) =>
        leaveState(l) === "pending" ? (
          <div className="flex justify-end gap-1">
            <button onClick={() => setEditor({ entry: l })} className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink" aria-label="Edit request" title="Edit">
              <Pencil className="h-4 w-4" />
            </button>
            <button onClick={() => cancel.show(l)} className="grid h-8 w-8 place-items-center rounded-lg text-danger hover:bg-danger-soft" aria-label="Cancel request" title="Cancel request">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave"
        description={fy ? `Your leave balance and requests for ${fy}.` : "Your leave balance and requests."}
        actions={
          <>
            <LeaveTabs />
            <Button onClick={() => setEditor({})}>
              <Plus className="h-4 w-4" /> Apply for leave
            </Button>
          </>
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="Leave balance">
        <StatCard label="Available" icon={CalendarCheck2} tone={b && b.available < 0 ? "danger" : "brand"} loading={balance.isLoading} value={b ? b.available.toFixed(1) : "—"} hint="days" />
        <StatCard label="Accrued so far" icon={CalendarPlus} loading={balance.isLoading} value={b ? b.accrued.toFixed(1) : "—"} hint={fy} />
        <StatCard label="Used" icon={CalendarMinus} loading={balance.isLoading} value={b ? b.used.toFixed(1) : "—"} hint="approved days" />
        <StatCard label="Adjustments" icon={Scale} loading={balance.isLoading} value={b ? `${b.adjustment > 0 ? "+" : ""}${b.adjustment.toFixed(1)}` : "—"} hint="by HR" />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          aria-label="Status"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "pending", label: "Pending", count: mine.filter((l) => leaveState(l) === "pending").length || undefined },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" },
            { value: "cancelled", label: "Cancelled" },
          ]}
        />
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(l) => l.id}
        loading={leaves.isLoading}
        error={leaves.isError}
        onRetry={() => leaves.refetch()}
        initialSort={{ key: "dates", dir: "desc" }}
        empty={{
          icon: CalendarCheck2,
          title: filter === "all" ? "No leave requests yet" : "No requests with this status",
          action:
            filter === "all" ? (
              <Button size="sm" onClick={() => setEditor({})}>
                <Plus className="h-4 w-4" /> Apply for leave
              </Button>
            ) : undefined,
        }}
      />

      <ApplyLeaveDialog open={!!editor} onClose={() => setEditor(null)} entry={editor?.entry} available={b?.available} />

      <ConfirmDialog
        open={cancel.open}
        onClose={cancel.close}
        tone="danger"
        title="Cancel this leave request?"
        confirmLabel="Cancel request"
        busy={m.cancel.isPending}
        description={cancel.value ? `${cancel.value.leaveId} · ${cancel.value.totalDays} day(s) of ${cancel.value.type}. Your manager will no longer see it.` : undefined}
        onConfirm={() =>
          cancel.value &&
          m.cancel.mutate(cancel.value.id, {
            onSuccess: () => (toast.success("Request cancelled"), cancel.close()),
            onError: (e) => toast.error("Couldn’t cancel", e instanceof ApiError ? e.message : undefined),
          })
        }
      />
    </div>
  );
}
