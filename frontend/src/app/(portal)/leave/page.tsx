"use client";

import { useState } from "react";
import { CalendarCheck2, History, Pencil, Plus, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { fmtDay, workDate } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ConfirmDialog, useDialogState } from "@/components/ui/confirm";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { leaveState, personName, useLeaveMutations, useLeaves, type Leave, type LeaveState } from "@/components/leave/api";
import { useLeaveLedger, useLeavePolicy, useMyBalances, type TypeBalance } from "@/components/leave/policy-api";
import { ApplyLeaveDialog } from "@/components/leave/apply-dialog";
import { LeaveBadge } from "@/components/leave/leave-badge";

export default function MyLeavePage() {
  const { user } = useAuth();
  const toast = useToast();
  const [filter, setFilter] = useState<"all" | LeaveState>("all");
  const [editor, setEditor] = useState<{ entry?: Leave | null } | null>(null);
  const cancel = useDialogState<Leave>();

  const balances = useMyBalances();
  const policy = useLeavePolicy();
  const ledger = useLeaveLedger(user?.id);
  const leaves = useLeaves({ employeeId: user?.id }, !!user);
  const m = useLeaveMutations();

  const mine = (leaves.data ?? []).filter((l) => l.employeeId === user?.id);
  const rows = mine.filter((l) => filter === "all" || leaveState(l) === filter);
  const yearLabel = balances.data?.label;

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
        title="My leave"
        description={yearLabel ? `Your balances and requests for leave year ${yearLabel}.` : "Your leave balances and requests."}
        actions={
          <>
            <Button onClick={() => setEditor({})}>
              <Plus className="h-4 w-4" /> Apply for leave
            </Button>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Leave balances">
        {balances.isLoading
          ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)
          : (balances.data?.balances ?? []).map((bal) => <BalanceCard key={bal.leaveTypeId} b={bal} />)}
        {!balances.isLoading && !balances.data?.balances.length && (
          <Card className="p-5 text-sm text-ink-muted sm:col-span-2 xl:col-span-3">Leave types haven’t been set up yet. HR can add them in Leave Tracker → Leave policy.</Card>
        )}
      </section>
      {policy.data && <p className="-mt-3 text-xs text-ink-subtle">Weekly offs: {policy.data.calendar.summary}. Firm holidays and weekly offs inside a leave aren’t deducted.</p>}

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

      <ApplyLeaveDialog open={!!editor} onClose={() => setEditor(null)} entry={editor?.entry} />

      {(ledger.data?.length ?? 0) > 0 && (
        <Card>
          <CardHeader icon={History} title="Balance changes" description="Opening balances, credits and adjustments made by HR or your manager" />
          <ul className="divide-y divide-line px-5 pb-3">
            {ledger.data!.slice(0, 10).map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2.5 text-[13px]">
                <span className={signed(r) >= 0 ? "w-14 font-semibold tabular text-success" : "w-14 font-semibold tabular text-danger"}>
                  {signed(r) > 0 ? "+" : ""}
                  {signed(r)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-ink">{r.leaveType.name} · {KIND[r.kind] ?? r.kind}</span>
                  {r.note && <span className="block truncate text-xs text-ink-subtle">{r.note}</span>}
                </span>
                <span className="text-xs text-ink-muted">{formatDate(r.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

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

/** Lapses and encashments are stored as positive days but reduce the balance. */
const signed = (r: { kind: string; days: number }) => (r.kind === "lapse" || r.kind === "encash" ? -r.days : r.days);

const KIND: Record<string, string> = { opening: "Opening balance", adjustment: "Adjustment", encash: "Encashed", carry_forward: "Carried forward", lapse: "Lapsed" };

function BalanceCard({ b }: { b: TypeBalance }) {
  const unpaid = !b.paid;
  const hasEntitlement = b.entitled != null || b.opening !== 0 || b.adjusted !== 0;
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-ink-muted">{b.name}</p>
          <p className={b.available < 0 ? "mt-1 font-display text-3xl font-bold tabular text-danger" : "mt-1 font-display text-3xl font-bold tabular text-ink"}>
            {unpaid ? "—" : b.available}
            {!unpaid && <span className="ml-1 text-sm font-medium text-ink-muted">days</span>}
          </p>
        </div>
        <span className="rounded-lg bg-surface-muted px-2 py-1 text-[11px] font-bold text-ink-muted">{b.code}</span>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
        {unpaid ? (
          <div className="col-span-3 text-ink-muted">No balance needed — taken as loss of pay. Used this year: <span className="font-semibold text-ink">{b.used}</span></div>
        ) : !hasEntitlement ? (
          <div className="col-span-3 text-ink-muted">Credited when earned (e.g. working on a weekly off). Used: <span className="font-semibold text-ink">{b.used}</span></div>
        ) : (
          <>
            <Stat label="Accrued" value={b.accrued + b.opening + b.adjusted} hint={b.entitled != null ? `of ${b.entitled} this year` : undefined} />
            <Stat label="Used" value={b.used} />
            <Stat label="Awaiting" value={b.pending} />
          </>
        )}
      </dl>
    </Card>
  );
}
function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div>
      <dt className="text-ink-subtle">{label}</dt>
      <dd className="font-semibold tabular text-ink">{Math.round(value * 100) / 100}</dd>
      {hint && <dd className="text-[11px] text-ink-subtle">{hint}</dd>}
    </div>
  );
}
