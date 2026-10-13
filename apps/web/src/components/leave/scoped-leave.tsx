"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, CalendarX2, Check, Clock3, Inbox, Plane, Scale, Search, Wallet, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { addDays, fmtDay, startOfMonth, today, workDate } from "@/lib/dates";
import { roleInfo } from "@/lib/roles";
import { SCOPE_TEXT, useScopePeople, useScopes } from "@/lib/scopes";
import { StatCard } from "@/components/ui/stat";
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
  canManageBalances,
  leaveState,
  personName,
  useLeaveBalances,
  useLeaveMutations,
  useLeaves,
  useNegativeBalances,
  type Leave,
  type ScopedBalance,
} from "@/components/leave/api";
import { LeaveBadge } from "@/components/leave/leave-badge";

function period(l: Leave) {
  const f = workDate(l.fromDate);
  const t = workDate(l.toDate);
  return f === t ? fmtDay(f, { weekday: "short", day: "numeric", month: "short" }) : `${fmtDay(f, { day: "numeric", month: "short" })} – ${fmtDay(t, { day: "numeric", month: "short", year: "numeric" })}`;
}

/** Team and Organization leave — the same screen, scoped by the API. */
export function ScopedLeave({ scope }: { scope: "team" | "org" }) {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const scopes = useScopes();
  const allowed = !!scopes.data?.[scope];
  const r = roleInfo(user?.role);
  // Team leads decide for their whole tree; firm-wide decisions stay with Admin / Owner / HR.
  const canDecide = scope === "team" || r.isAdmin || r.isOwner || r.isHR;
  const balancesAdmin = scope === "org" && canManageBalances(user?.role);
  const now = today();

  const [search, setSearch] = useState("");
  const [decision, setDecision] = useState<{ leave: Leave; status: "approved" | "rejected" } | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);

  useEffect(() => {
    if (scopes.data && !allowed) router.replace("/leave");
  }, [scopes.data, allowed, router]);

  const leaves = useLeaves({ scope }, allowed);
  const balances = useLeaveBalances(scope, allowed);
  const negative = useNegativeBalances(balancesAdmin);
  const m = useLeaveMutations();

  const team = useMemo(() => (leaves.data ?? []).filter((l) => l.employeeId !== user?.id), [leaves.data, user?.id]);
  const match = (l: Leave) => !search.trim() || `${personName(l.employee)} ${l.leaveId} ${l.type} ${l.reason}`.toLowerCase().includes(search.trim().toLowerCase());
  const pending = team.filter((l) => leaveState(l) === "pending" && match(l));
  const approved = team.filter((l) => leaveState(l) === "approved");
  const overlaps = (l: Leave, a: string, b: string) => workDate(l.fromDate) <= b && workDate(l.toDate) >= a;
  const awayToday = approved.filter((l) => overlaps(l, now, now));
  const awayWeek = approved.filter((l) => !overlaps(l, now, now) && overlaps(l, addDays(now, 1), addDays(now, 7)));
  const monthDays = approved.filter((l) => overlaps(l, startOfMonth(now), now)).reduce((a, l) => a + l.totalDays, 0);
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
        title={scope === "team" ? "Team leave" : "Organization leave"}
        description={`${SCOPE_TEXT[scope]} ${canDecide ? "Approve or reject requests here." : "View only — requests are decided by each person’s manager, partner or HR."}`}
        actions={
          <>
            {balancesAdmin && (
              <Button variant="secondary" onClick={() => setAdjustOpen(true)}>
                <Scale className="h-4 w-4" /> Adjust balance
              </Button>
            )}
          </>
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="Summary">
        <StatCard label="On leave today" icon={Plane} tone="brand" loading={leaves.isLoading} value={new Set(awayToday.map((l) => l.employeeId)).size} hint={fmtDay(now, { day: "numeric", month: "short" })} />
        <StatCard label="Away in the next 7 days" icon={CalendarClock} loading={leaves.isLoading} value={new Set(awayWeek.map((l) => l.employeeId)).size} hint="people" />
        <StatCard
          label="Awaiting decision"
          icon={Clock3}
          tone={team.some((l) => leaveState(l) === "pending") ? "warning" : "neutral"}
          loading={leaves.isLoading}
          value={team.filter((l) => leaveState(l) === "pending").length}
          hint="requests"
        />
        <StatCard label="Approved this month" icon={CalendarX2} loading={leaves.isLoading} value={monthDays} hint="days, requests overlapping this month" />
      </section>

      {(awayToday.length > 0 || awayWeek.length > 0) && (
        <Card>
          <CardHeader icon={Plane} title="Who’s away" description="Approved leave today and over the next 7 days" />
          <ul className="divide-y divide-line px-5 pb-3">
            {[...awayToday.map((l) => ({ l, when: "Today" })), ...awayWeek.map((l) => ({ l, when: "Upcoming" }))].map(({ l, when }) => (
              <li key={l.id} className="flex items-center gap-3 py-2.5">
                <Avatar name={personName(l.employee)} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{personName(l.employee)}</span>
                  <span className="block text-xs text-ink-subtle">
                    {l.type} · {period(l)}
                  </span>
                </span>
                <span className={when === "Today" ? "rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand" : "text-xs text-ink-muted"}>{when}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
        <Input placeholder="Search name, request ID, type or reason" aria-label="Search" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card>
        <CardHeader icon={Inbox} title={canDecide ? "Waiting for your decision" : "Waiting for a decision"} description={leaves.isLoading ? undefined : `${pending.length} request${pending.length === 1 ? "" : "s"}`} />
        {leaves.isLoading ? (
          <div className="grid gap-3 p-5 md:grid-cols-2">
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
          </div>
        ) : pending.length === 0 ? (
          <EmptyState icon={Inbox} title="No leave requests waiting" description="New requests will appear here." />
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
                {canDecide && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="secondary" className="flex-1 justify-center text-danger" onClick={() => setDecision({ leave: l, status: "rejected" })}>
                    <X className="h-4 w-4" /> Reject
                  </Button>
                  <Button size="sm" className="flex-1 justify-center" onClick={() => setDecision({ leave: l, status: "approved" })}>
                    <Check className="h-4 w-4" /> Approve
                  </Button>
                </div>
                )}
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

      <BalancesTable rows={balances.data} loading={balances.isLoading} error={balances.isError} onRetry={() => balances.refetch()} search={search} />

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

      {adjustOpen && <AdjustDialog scope={scope} onClose={() => setAdjustOpen(false)} />}
    </div>
  );
}

function AdjustDialog({ scope, onClose }: { scope: "team" | "org"; onClose: () => void }) {
  const toast = useToast();
  const people = useScopePeople(scope);
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

function BalancesTable({ rows, loading, error, onRetry, search }: { rows?: ScopedBalance[]; loading: boolean; error: boolean; onRetry: () => void; search: string }) {
  const q = search.trim().toLowerCase();
  const list = (rows ?? []).filter((b) => !q || `${b.firstName} ${b.lastName} ${b.employeeId}`.toLowerCase().includes(q));
  const missing = (rows ?? []).filter((b) => b.total == null).length;
  const columns: Column<ScopedBalance>[] = [
    {
      key: "emp",
      header: "Employee",
      sortValue: (b) => `${b.firstName} ${b.lastName}`,
      cell: (b) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={`${b.firstName} ${b.lastName}`} size={30} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">
              {b.firstName} {b.lastName}
            </p>
            <p className="truncate text-xs text-ink-subtle">
              {b.employeeId} · {b.designation}
            </p>
          </div>
        </div>
      ),
    },
    { key: "total", header: "Entitled", align: "right", sortValue: (b) => b.total ?? -1, cell: (b) => (b.total == null ? <span className="text-ink-subtle">Not set up</span> : b.total) },
    { key: "used", header: "Used", align: "right", sortValue: (b) => b.used ?? -1, cell: (b) => b.used ?? "—" },
    {
      key: "remaining",
      header: "Remaining",
      align: "right",
      sortValue: (b) => b.remaining ?? -999,
      cell: (b) => (b.remaining == null ? "—" : <span className={b.remaining < 0 ? "font-semibold text-danger" : "font-semibold text-ink"}>{b.remaining}</span>),
    },
  ];
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-display text-base font-bold text-ink">
          <Wallet className="h-4 w-4 text-brand" aria-hidden /> Balances {new Date().getFullYear()}
        </h3>
        {missing > 0 && (
          <p className="text-xs text-ink-muted">
            {missing} {missing === 1 ? "person has" : "people have"} no balance set up yet — none is assumed.
          </p>
        )}
      </div>
      <DataTable rows={list} columns={columns} rowKey={(b) => b.id} loading={loading} error={error} onRetry={onRetry} pageSize={10} initialSort={{ key: "emp", dir: "asc" }} empty={{ title: "Nobody in this view" }} />
    </div>
  );
}
