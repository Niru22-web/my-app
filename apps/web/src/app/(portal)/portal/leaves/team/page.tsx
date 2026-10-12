"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Inbox, Scale, Search, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { fmtDay, workDate } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm";
import { FormRow, Input, Select, Textarea } from "@/components/ui/inputs";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import {
  canApproveLeave,
  canManageBalances,
  leaveState,
  personName,
  useLeaveMutations,
  useLeaves,
  useNegativeBalances,
  type Leave,
} from "@/components/leave/api";
import { LeaveBadge } from "@/components/leave/leave-badge";
import { LeaveTabs } from "@/components/leave/leave-tabs";
import { useScopedPeople } from "@/components/attendance/api";

function period(l: Leave) {
  const f = workDate(l.fromDate);
  const t = workDate(l.toDate);
  return f === t ? fmtDay(f, { weekday: "short", day: "numeric", month: "short" }) : `${fmtDay(f, { day: "numeric", month: "short" })} – ${fmtDay(t, { day: "numeric", month: "short", year: "numeric" })}`;
}

export default function TeamLeavePage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const allowed = canApproveLeave(user?.role);
  const balancesAdmin = canManageBalances(user?.role);

  const [search, setSearch] = useState("");
  const [decision, setDecision] = useState<{ leave: Leave; status: "approved" | "rejected" } | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);

  useEffect(() => {
    if (!allowed) router.replace("/portal/leaves");
  }, [allowed, router]);

  const leaves = useLeaves({}, allowed);
  const negative = useNegativeBalances(balancesAdmin);
  const m = useLeaveMutations();

  const team = useMemo(() => (leaves.data ?? []).filter((l) => l.employeeId !== user?.id), [leaves.data, user?.id]);
  const match = (l: Leave) => !search.trim() || `${personName(l.employee)} ${l.leaveId} ${l.type} ${l.reason}`.toLowerCase().includes(search.trim().toLowerCase());
  const pending = team.filter((l) => leaveState(l) === "pending" && match(l));
  const history = team.filter((l) => leaveState(l) !== "pending" && match(l));

  if (!allowed) return null;

  const columns: Column<Leave>[] = [
    {
      key: "emp",
      header: "Employee",
      sortValue: (l) => personName(l.employee),
      cell: (l) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={personName(l.employee)} size={30} />
          <span className="text-sm font-medium text-ink">{personName(l.employee)}</span>
        </div>
      ),
    },
    { key: "type", header: "Type", hideBelow: "md", sortValue: (l) => l.type, cell: (l) => l.type },
    { key: "period", header: "Period", sortValue: (l) => workDate(l.fromDate), cell: (l) => <span className="whitespace-nowrap">{period(l)}</span> },
    { key: "days", header: "Days", align: "right", sortValue: (l) => l.totalDays, cell: (l) => l.totalDays },
    { key: "status", header: "Status", sortValue: (l) => l.status, cell: (l) => <LeaveBadge leave={l} /> },
    {
      key: "by",
      header: "Processed",
      hideBelow: "lg",
      sortValue: (l) => l.approvedDate ?? "",
      cell: (l) => <span className="text-ink-muted">{l.approvedDate ? `${formatDate(l.approvedDate)}${l.approver ? ` · ${personName(l.approver)}` : ""}` : "—"}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team leave"
        description="Approve leave for the people who report to you."
        actions={
          <>
            <LeaveTabs pending={team.filter((l) => leaveState(l) === "pending").length} />
            {balancesAdmin && (
              <Button variant="secondary" onClick={() => setAdjustOpen(true)}>
                <Scale className="h-4 w-4" /> Adjust balance
              </Button>
            )}
          </>
        }
      />

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
        <Input placeholder="Search name, request ID, type or reason" aria-label="Search" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card>
        <CardHeader icon={Inbox} title="Waiting for your decision" description={leaves.isLoading ? undefined : `${pending.length} request${pending.length === 1 ? "" : "s"}`} />
        {leaves.isLoading ? (
          <div className="grid gap-3 p-5 md:grid-cols-2">
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
          </div>
        ) : pending.length === 0 ? (
          <EmptyState icon={Inbox} title="No leave requests waiting" description="New requests from your team will appear here." />
        ) : (
          <div className="grid gap-3 p-5 md:grid-cols-2 2xl:grid-cols-3">
            {pending.map((l) => (
              <div key={l.id} className="flex flex-col rounded-xl border border-line bg-surface-muted p-4">
                <div className="flex items-start gap-3">
                  <Avatar name={personName(l.employee)} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{personName(l.employee)}</p>
                    <p className="text-xs text-ink-subtle">
                      {l.leaveId} · applied {formatDate(l.appliedDate)}
                    </p>
                  </div>
                  <span className="rounded-lg bg-brand px-2 py-1 text-xs font-bold text-brand-ink tabular">{l.totalDays}d</span>
                </div>
                <p className="mt-3 text-[13px] font-medium text-ink">
                  {l.type} · {period(l)}
                </p>
                <p className="mt-1 line-clamp-3 flex-1 text-[13px] text-ink-muted">{l.reason}</p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="secondary" className="flex-1 justify-center text-danger" onClick={() => setDecision({ leave: l, status: "rejected" })}>
                    <X className="h-4 w-4" /> Reject
                  </Button>
                  <Button size="sm" className="flex-1 justify-center" onClick={() => setDecision({ leave: l, status: "approved" })}>
                    <Check className="h-4 w-4" /> Approve
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {balancesAdmin && (negative.data?.length ?? 0) > 0 && (
        <Card>
          <CardHeader icon={AlertTriangle} title="Negative balances" description="People who have used more leave than they’ve accrued this year" />
          <ul className="divide-y divide-line px-5 pb-3">
            {negative.data!.map((n) => (
              <li key={n.id} className="flex items-center gap-3 py-2.5">
                <Avatar name={`${n.firstName} ${n.lastName}`} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">
                    {n.firstName} {n.lastName}
                  </span>
                  <span className="block text-xs text-ink-subtle">
                    {n.employeeId}
                    {n.department ? ` · ${n.department}` : ""}
                  </span>
                </span>
                <span className="text-sm font-bold text-danger tabular">{n.balance.toFixed(1)} d</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div>
        <h3 className="mb-3 font-display text-base font-bold text-ink">History</h3>
        <DataTable
          rows={history}
          columns={columns}
          rowKey={(l) => l.id}
          loading={leaves.isLoading}
          error={leaves.isError}
          onRetry={() => leaves.refetch()}
          initialSort={{ key: "period", dir: "desc" }}
          empty={{ title: "No processed requests yet" }}
        />
      </div>

      <ConfirmDialog
        open={!!decision}
        onClose={() => setDecision(null)}
        tone={decision?.status === "rejected" ? "danger" : "primary"}
        title={decision?.status === "approved" ? "Approve this leave?" : "Reject this leave?"}
        confirmLabel={decision?.status === "approved" ? "Approve" : "Reject"}
        busy={m.decide.isPending}
        description={
          decision
            ? `${personName(decision.leave.employee)} · ${decision.leave.type} · ${period(decision.leave)} (${decision.leave.totalDays} day${decision.leave.totalDays === 1 ? "" : "s"}).${
                decision.status === "approved" ? " The days will be deducted from their balance." : " They’ll be notified."
              }`
            : undefined
        }
        onConfirm={() =>
          decision &&
          m.decide.mutate(
            { id: decision.leave.id, status: decision.status },
            {
              onSuccess: () => (toast.success(decision.status === "approved" ? "Leave approved" : "Leave rejected", `${personName(decision.leave.employee)} has been notified.`), setDecision(null)),
              onError: (e) => toast.error("Couldn’t update the request", e instanceof ApiError ? e.message : undefined),
            },
          )
        }
      />

      {adjustOpen && <AdjustDialog onClose={() => setAdjustOpen(false)} />}
    </div>
  );
}

function AdjustDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const people = useScopedPeople(true);
  const { adjust } = useLeaveMutations();
  const [employeeId, setEmployeeId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function save() {
    const n = Number(amount);
    if (!employeeId) return setError("Choose an employee.");
    if (!amount || Number.isNaN(n) || n === 0 || Math.abs(n) > 60 || Math.round(n * 2) !== n * 2) return setError("Enter a non-zero amount in half-day steps, e.g. 1, -0.5.");
    if (reason.trim().length < 5) return setError("Give a reason for the record.");
    adjust.mutate(
      { employeeId, amount: n, reason: reason.trim() },
      {
        onSuccess: () => (toast.success("Balance adjusted", `${n > 0 ? "+" : ""}${n} day(s)`), onClose()),
        onError: (e) => setError(e instanceof ApiError ? e.message : "Couldn’t adjust the balance."),
      },
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title="Adjust leave balance"
      description="Add or remove days, e.g. for compensatory leave or a correction."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={adjust.isPending}>
            Cancel
          </Button>
          <Button onClick={save} loading={adjust.isPending}>
            Save adjustment
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormRow label="Employee" htmlFor="adj-emp" required>
          <Select id="adj-emp" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">{people.isLoading ? "Loading…" : "Select an employee"}</option>
            {(people.data ?? [])
              .slice()
              .sort((a, b) => a.firstName.localeCompare(b.firstName))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.firstName} {p.lastName} ({p.employeeId})
                </option>
              ))}
          </Select>
        </FormRow>
        <FormRow label="Days" htmlFor="adj-amt" required hint="Positive adds days, negative removes them.">
          <Input id="adj-amt" inputMode="decimal" placeholder="e.g. 1 or -0.5" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </FormRow>
        <FormRow label="Reason" htmlFor="adj-reason" required>
          <Textarea id="adj-reason" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </FormRow>
        {error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
