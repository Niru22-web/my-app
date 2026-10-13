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
  useLeaveMutations,
  useLeaves,
  useNegativeBalances,
  type Leave,
} from "@/components/leave/api";
import { LeaveBadge } from "@/components/leave/leave-badge";
import { useLeavePolicy, usePolicyMutations, useScopeBalances, type ScopeBalances } from "@/components/leave/policy-api";

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
  const balances = useScopeBalances(scope, allowed);
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
            {(balancesAdmin || scope === "team") && (
              <Button variant="secondary" onClick={() => setAdjustOpen(true)}>
                <Scale className="h-4 w-4" /> {balancesAdmin ? "Credit / adjust balance" : "Credit comp-off"}
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

      <BalancesTable data={balances.data} loading={balances.isLoading} error={balances.isError} onRetry={() => balances.refetch()} search={search} />

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

      {adjustOpen && <CreditDialog scope={scope} full={balancesAdmin} onClose={() => setAdjustOpen(false)} />}
    </div>
  );
}

/**
 * HR / Admin: opening balance, adjustment (+/−) or encashment for any leave type.
 * Team leads: credit earned leave (types with no fixed entitlement, e.g. Compensatory Off) to their team.
 */
function CreditDialog({ scope, full, onClose }: { scope: "team" | "org"; full: boolean; onClose: () => void }) {
  const toast = useToast();
  const people = useScopePeople(scope);
  const policy = useLeavePolicy();
  const { credit } = usePolicyMutations();
  const types = (policy.data?.types ?? []).filter((t) => t.active && t.paid && (full || t.annualDays == null));
  const [employeeId, setEmployeeId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [kind, setKind] = useState<"adjustment" | "opening" | "encash">("adjustment");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const leaveTypeId = typeId || types[0]?.id || "";
  const type = types.find((t) => t.id === leaveTypeId);

  function save() {
    const n = Number(amount);
    if (!employeeId) return setError("Choose an employee.");
    if (!leaveTypeId) return setError("Choose a leave type.");
    if (!amount || Number.isNaN(n) || n === 0 || Math.abs(n) > 366 || Math.round(n * 4) !== n * 4) return setError("Enter a non-zero number of days, e.g. 1, 0.5 or -1.");
    if (!full && n < 0) return setError("Team leads can only add days.");
    if (note.trim().length < 3) return setError("Add a note for the record, e.g. the date worked.");
    credit.mutate(
      { employeeId, leaveTypeId, days: n, note: note.trim(), kind: full ? kind : "adjustment" },
      {
        onSuccess: () => (toast.success("Balance updated", `${n > 0 ? "+" : ""}${n} day(s) · ${type?.name ?? ""}`), onClose()),
        onError: (e) => setError(e instanceof ApiError ? e.message : "Couldn’t update the balance."),
      },
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={full ? "Credit or adjust a balance" : "Credit compensatory off"}
      description={full ? "Every change is recorded with your name and note." : "For someone in your team who worked on a weekly off or holiday."}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={credit.isPending}>
            Cancel
          </Button>
          <Button onClick={save} loading={credit.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormRow label="Employee" htmlFor="cr-emp" required>
          <Select id="cr-emp" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">{people.isLoading ? "Loading…" : "Select an employee"}</option>
            {(people.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.firstName} {p.lastName} ({p.employeeId})
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Leave type" htmlFor="cr-type" required>
          <Select id="cr-type" value={leaveTypeId} onChange={(e) => setTypeId(e.target.value)}>
            {!types.length && <option value="">No leave types available</option>}
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </FormRow>
        {full && (
          <FormRow label="What is this?" htmlFor="cr-kind" required hint={kind === "opening" ? "Sets the balance brought in (e.g. from Zoho) — replaces any earlier opening balance." : kind === "encash" ? "Days paid out instead of taken." : "Adds or removes days, e.g. comp-off or a correction."}>
            <Select id="cr-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="adjustment">Credit / adjustment</option>
              <option value="opening">Opening balance</option>
              {type?.encashable && <option value="encash">Encashment</option>}
            </Select>
          </FormRow>
        )}
        <FormRow label="Days" htmlFor="cr-amt" required hint={full && kind === "adjustment" ? "Positive adds days, negative removes them." : undefined}>
          <Input id="cr-amt" inputMode="decimal" placeholder="e.g. 1 or 0.5" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </FormRow>
        <FormRow label="Note" htmlFor="cr-note" required>
          <Textarea id="cr-note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder={full ? "Reason for the record" : "e.g. Worked on Saturday 10 Oct for audit closing"} />
        </FormRow>
        {error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}

type BalanceRow = ScopeBalances["people"][number];

function BalancesTable({ data, loading, error, onRetry, search }: { data?: ScopeBalances; loading: boolean; error: boolean; onRetry: () => void; search: string }) {
  const q = search.trim().toLowerCase();
  const types = (data?.types ?? []).filter((t) => t.paid);
  const list = (data?.people ?? []).filter((p) => !q || `${p.firstName} ${p.lastName} ${p.employeeId}`.toLowerCase().includes(q));
  const of = (p: BalanceRow, id: string) => p.balances.find((b) => b.leaveTypeId === id);
  const columns: Column<BalanceRow>[] = [
    {
      key: "emp",
      header: "Employee",
      sortValue: (p) => `${p.firstName} ${p.lastName}`,
      cell: (p) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={`${p.firstName} ${p.lastName}`} size={30} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">
              {p.firstName} {p.lastName}
            </p>
            <p className="truncate text-xs text-ink-subtle">
              {p.employeeId} · {p.designation}
            </p>
          </div>
        </div>
      ),
    },
    ...types.flatMap((t): Column<BalanceRow>[] => [
      {
        key: `${t.code}-avail`,
        header: `${t.code} available`,
        align: "right",
        sortValue: (p) => of(p, t.id)?.available ?? -999,
        cell: (p) => {
          const b = of(p, t.id);
          if (!b) return "—";
          return <span className={b.available < 0 ? "font-semibold text-danger" : "font-semibold text-ink"}>{b.available}</span>;
        },
      },
      { key: `${t.code}-used`, header: `${t.code} used`, align: "right", hideBelow: "md", sortValue: (p) => of(p, t.id)?.used ?? -1, cell: (p) => of(p, t.id)?.used ?? "—" },
    ]),
  ];
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-display text-base font-bold text-ink">
          <Wallet className="h-4 w-4 text-brand" aria-hidden /> Balances {data?.label ?? ""}
        </h3>
        <p className="text-xs text-ink-muted">Available = opening + accrued to date + credits − approved leave.</p>
      </div>
      <DataTable rows={list} columns={columns} rowKey={(p) => p.id} loading={loading} error={error} onRetry={onRetry} pageSize={10} initialSort={{ key: "emp", dir: "asc" }} empty={{ title: types.length ? "Nobody in this view" : "No paid leave types set up yet" }} />
    </div>
  );
}
