"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCheck, Download, Inbox, Lock, RotateCcw, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError, downloadFile } from "@/lib/api";
import { fmtDay, startOfMonth, today, workDate } from "@/lib/dates";
import { roleInfo } from "@/lib/roles";
import { SCOPE_TEXT, useScopePeople, useScopes } from "@/lib/scopes";
import { formatHours, formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { FormRow, Input, Select, Textarea } from "@/components/ui/inputs";
import { Avatar } from "@/components/ui/avatar";
import { StatCard } from "@/components/ui/stat";
import { useToast } from "@/components/ui/toast";
import { employeeName, statusOf, useProjects, useTeamTimelogs, useTimelogMutations, type TeamFilters, type Timelog } from "@/components/timesheet/api";
import { StatusBadge } from "@/components/timesheet/status-badge";
import { LockDialog } from "@/components/timesheet/lock-dialog";

const STATUS_TABS: { key: string; label: string }[] = [
  { key: "Submitted", label: "Awaiting approval" },
  { key: "Approved", label: "Approved" },
  { key: "Rejected", label: "Returned" },
  { key: "Draft", label: "Draft" },
  { key: "", label: "All" },
];

/** Team and Organization timesheets — the same screen, scoped by the API. */
export function ScopedTimesheets({ scope }: { scope: "team" | "org" }) {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const scopes = useScopes();
  const allowed = !!scopes.data?.[scope];
  const r = roleInfo(user?.role);
  // Team leads approve their whole tree; firm-wide approval stays with Admin / Owner.
  const canAct = scope === "team" || r.isAdmin || r.isOwner;

  const [filters, setFilters] = useState<TeamFilters>(() =>
    scope === "team" ? { scope, status: "Submitted" } : { scope, status: "", dateFrom: startOfMonth(today()), dateTo: today() },
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Timelog | null>(null);
  const [rejecting, setRejecting] = useState<string[] | null>(null);
  const [lockOpen, setLockOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState("");

  async function exportExcel() {
    setExporting(true);
    try {
      await downloadFile("timelogs/export", `timesheets-${scope}-${today()}.xlsx`, {
        scope,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        employeeId: filters.employeeId,
        status: filters.status ? filters.status.toLowerCase() : undefined,
      });
    } catch (e) {
      toast.error("Couldn’t export", e instanceof ApiError ? e.message : undefined);
    } finally {
      setExporting(false);
    }
  }

  const q = useTeamTimelogs(filters, allowed);
  const people = useScopePeople(scope, allowed);
  const projects = useProjects();
  const m = useTimelogMutations();

  const rows = useMemo(() => q.data ?? [], [q.data]);
  const term = search.trim().toLowerCase();
  const visible = term
    ? rows.filter((t) => `${employeeName(t)} ${t.employee?.employeeId ?? ""} ${t.job?.project?.name ?? ""} ${t.job?.jobId ?? ""} ${t.description ?? ""}`.toLowerCase().includes(term))
    : rows;
  const actionable = (t: Timelog) => canAct && statusOf(t) === "submitted" && t.employeeId !== user?.id;
  const selectable = rows.filter(actionable);
  const selectedIds = [...selected].filter((id) => selectable.some((r) => r.id === id));

  useEffect(() => {
    if (scopes.data && !allowed) router.replace("/timesheet");
  }, [scopes.data, allowed, router]);

  if (!allowed) return null;

  const set = (patch: Partial<TeamFilters>) => {
    setSelected(new Set());
    setFilters((f) => ({ ...f, ...patch }));
  };

  const onErr = (title: string) => (e: unknown) => toast.error(title, e instanceof ApiError ? e.message : undefined);

  const approve = (ids: string[]) => {
    if (ids.length === 1)
      m.approve.mutate(ids[0], {
        onSuccess: () => (toast.success("Entry approved"), setDetail(null), setSelected(new Set())),
        onError: onErr("Couldn’t approve"),
      });
    else
      m.approveMany.mutate(ids, {
        onSuccess: (r) => {
          const n = r.data?.count ?? 0;
          toast.success(
            `${n} entr${n === 1 ? "y" : "ies"} approved`,
            n < ids.length ? `${ids.length - n} skipped — not yours to approve or no longer pending.` : undefined,
          );
          setSelected(new Set());
        },
        onError: onErr("Couldn’t approve"),
      });
  };

  const pendingHours = rows.filter((r) => statusOf(r) === "submitted").reduce((a, r) => a + r.hours, 0);
  const pendingPeople = new Set(rows.filter((r) => statusOf(r) === "submitted").map((r) => r.employeeId)).size;

  const columns: Column<Timelog>[] = [
    {
      key: "employee",
      header: "Employee",
      sortValue: (t) => employeeName(t),
      cell: (t) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={employeeName(t)} size={30} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{employeeName(t)}</p>
            <p className="truncate text-xs text-ink-subtle">{t.employee?.employeeId}</p>
          </div>
        </div>
      ),
    },
    {
      key: "date",
      header: "Date",
      sortValue: (t) => workDate(t.date),
      cell: (t) => <span className="whitespace-nowrap">{fmtDay(workDate(t.date))}</span>,
    },
    {
      key: "work",
      header: "Project / job",
      hideBelow: "md",
      cell: (t) => (
        <div className="max-w-[320px]">
          <p className="truncate text-sm text-ink">{t.job?.project?.name ?? "—"}</p>
          <p className="truncate text-xs text-ink-subtle">
            {t.job?.jobId} · {t.description}
          </p>
        </div>
      ),
    },
    {
      key: "hours",
      header: "Hours",
      align: "right",
      sortValue: (t) => t.hours,
      cell: (t) => <span className="font-semibold">{formatHours(t.hours)}</span>,
    },
    {
      key: "status",
      header: "Status",
      hideBelow: "sm",
      sortValue: (t) => statusOf(t),
      cell: (t) => <StatusBadge entry={t} />,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (t) =>
        actionable(t) ? (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => approve([t.id])}
              className="grid h-8 w-8 place-items-center rounded-lg text-success hover:bg-success-soft"
              aria-label="Approve"
              title="Approve"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              onClick={() => setRejecting([t.id])}
              className="grid h-8 w-8 place-items-center rounded-lg text-danger hover:bg-danger-soft"
              aria-label="Return"
              title="Return with reason"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={scope === "team" ? "Team timesheets" : "Organization timesheets"}
        description={`${SCOPE_TEXT[scope]} ${canAct ? "Approve or return submitted time here." : "View only — approvals are done by each person’s manager or partner."}`}
        actions={
          <>
            <Button variant="secondary" onClick={exportExcel} loading={exporting} disabled={!allowed}>
              <Download className="h-4 w-4" /> Export to Excel
            </Button>
            {(r.isAdmin || r.isOwner) && (
              <Button variant="secondary" onClick={() => setLockOpen(true)}>
                <Lock className="h-4 w-4" /> Lock period
              </Button>
            )}
          </>
        }
      />
      <LockDialog open={lockOpen} onClose={() => setLockOpen(false)} />

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Summary">
        <StatCard label="Awaiting approval" value={rows.filter((r) => statusOf(r) === "submitted").length} tone="brand" loading={q.isLoading} hint="entries" />
        <StatCard label="Hours awaiting" value={formatHours(pendingHours)} loading={q.isLoading} />
        <StatCard label="People with pending time" value={pendingPeople} loading={q.isLoading} />
      </section>

      {selectable.length > 0 && (
        <div
          className={cn(
            "flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3",
            selectedIds.length ? "border-brand/30 bg-brand-softer" : "border-line bg-surface",
          )}
        >
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--brand)]"
              checked={selectedIds.length === selectable.length}
              onChange={(e) => setSelected(e.target.checked ? new Set(selectable.map((r) => r.id)) : new Set())}
            />
            {selectedIds.length ? `${selectedIds.length} selected` : `Select all ${selectable.length} pending`}
          </label>
          {selectedIds.length > 0 && (
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setRejecting(selectedIds)}>
                <RotateCcw className="h-4 w-4" /> Return
              </Button>
              <Button size="sm" onClick={() => approve(selectedIds)} loading={m.approveMany.isPending}>
                <CheckCheck className="h-4 w-4" /> Approve {selectedIds.length}
              </Button>
            </div>
          )}
        </div>
      )}

      <DataTable
        exportName={false}
        itemsLabel="entries"
        filterTabs={STATUS_TABS.map((s) => ({ ...s, count: s.key === (filters.status ?? "") && !q.isLoading && !q.isError ? rows.length : undefined }))}
        activeFilterTab={filters.status ?? ""}
        onFilterTabChange={(k) => set({ status: k as TeamFilters["status"] })}
        searchable
        searchPlaceholder="Search name, project, job, description…"
        searchValue={search}
        onSearchChange={setSearch}
        toolbarActions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Select aria-label="Employee" value={filters.employeeId ?? ""} onChange={(e) => set({ employeeId: e.target.value || undefined })} className="w-40">
              <option value="">Everyone</option>
              {(people.data ?? [])
                .filter((p) => p.id !== user?.id)
                .sort((a, b) => a.firstName.localeCompare(b.firstName))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.firstName} {p.lastName}
                  </option>
                ))}
            </Select>
            <Select aria-label="Project" value={filters.projectId ?? ""} onChange={(e) => set({ projectId: e.target.value || undefined })} className="w-40">
              <option value="">All projects</option>
              {(projects.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <Input type="date" aria-label="From" title="From" value={filters.dateFrom ?? ""} onChange={(e) => set({ dateFrom: e.target.value || undefined })} className="h-9 w-[150px]" />
            <Input type="date" aria-label="To" title="To" value={filters.dateTo ?? ""} min={filters.dateFrom} onChange={(e) => set({ dateTo: e.target.value || undefined })} className="h-9 w-[150px]" />
          </div>
        }
        selectable={selectable.length > 0}
        selectedKeys={selected}
        onSelectionChange={(s) => setSelected(new Set([...s].filter((id) => selectable.some((r) => r.id === id))))}
        rows={visible}
        columns={columns}
        rowKey={(t) => t.id}
        loading={q.isLoading}
        error={q.isError}
        onRetry={() => q.refetch()}
        onRowClick={setDetail}
        initialSort={{ key: "date", dir: "desc" }}
        empty={{
          icon: Inbox,
          title: filters.status === "Submitted" && !term ? "Nothing waiting for approval" : "No entries match these filters",
          description: filters.status === "Submitted" && !term ? "Submitted time will appear here." : undefined,
        }}
      />

      <Dialog
        open={!!detail}
        onClose={() => setDetail(null)}
        title="Time entry"
        description={
          detail ? `${employeeName(detail)} · ${fmtDay(workDate(detail.date), { weekday: "long", day: "numeric", month: "long", year: "numeric" })}` : undefined
        }
        footer={
          detail && actionable(detail) ? (
            <>
              <Button variant="secondary" onClick={() => setRejecting([detail.id])}>
                <RotateCcw className="h-4 w-4" /> Return
              </Button>
              <Button onClick={() => approve([detail.id])} loading={m.approve.isPending}>
                <Check className="h-4 w-4" /> Approve
              </Button>
            </>
          ) : undefined
        }
      >
        {detail && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Item label="Client" value={detail.job?.project?.client?.name} />
            <Item label="Project" value={detail.job?.project?.name} />
            <Item label="Job" value={detail.job ? `${detail.job.jobId} · ${detail.job.name}` : undefined} />
            <Item label="Hours" value={formatHours(detail.hours)} />
            <Item label="Billing" value={detail.billableStatus === "non_billable" ? "Non-billable" : "Billable"} />
            <Item label="Status" value={<StatusBadge entry={detail} />} />
            {detail.workItem && <Item label="Work item" value={detail.workItem} />}
            {detail.submittedAt && <Item label="Submitted" value={formatDate(detail.submittedAt)} />}
            <div className="col-span-2">
              <dt className="text-xs text-ink-subtle">Description</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-ink">{detail.description}</dd>
            </div>
            {detail.rejectionReason && statusOf(detail) === "rejected" && (
              <div className="col-span-2 rounded-xl bg-danger-soft px-3 py-2 text-danger">
                <dt className="text-xs font-semibold">Return reason</dt>
                <dd className="mt-0.5">{detail.rejectionReason}</dd>
              </div>
            )}
          </dl>
        )}
      </Dialog>

      <RejectDialog
        ids={rejecting}
        onClose={() => setRejecting(null)}
        busy={m.reject.isPending || m.rejectMany.isPending}
        onConfirm={(ids, reason) => {
          const done = (n: number) => {
            toast.success(n === 1 ? "Entry returned" : `${n} entries returned`, "The employee has been notified.");
            setRejecting(null);
            setDetail(null);
            setSelected(new Set());
          };
          if (ids.length === 1)
            m.reject.mutate(
              { id: ids[0], reason },
              {
                onSuccess: () => done(1),
                onError: onErr("Couldn’t return entry"),
              },
            );
          else
            m.rejectMany.mutate(
              { ids, reason },
              {
                onSuccess: (r) => done(r.data?.count ?? ids.length),
                onError: onErr("Couldn’t return entries"),
              },
            );
        }}
      />
    </div>
  );
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-subtle">{label}</dt>
      <dd className="mt-0.5 text-ink">{value ?? "—"}</dd>
    </div>
  );
}

function RejectDialog({
  ids,
  onClose,
  onConfirm,
  busy,
}: {
  ids: string[] | null;
  onClose: () => void;
  onConfirm: (ids: string[], reason: string) => void;
  busy: boolean;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setReason("");
    setError(null);
    onClose();
  };
  const n = ids?.length ?? 0;
  return (
    <Dialog
      open={!!ids}
      onClose={close}
      size="sm"
      title={n > 1 ? `Return ${n} entries` : "Return entry"}
      description="The employee will see this reason and can correct and resubmit."
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={() => {
              if (reason.trim().length < 3) return setError("Please give a short reason.");
              onConfirm(ids!, reason.trim());
              setReason("");
            }}
          >
            Return
          </Button>
        </>
      }
    >
      <FormRow label="Reason" htmlFor="reject-reason" required error={error ?? undefined}>
        <Textarea
          id="reject-reason"
          rows={3}
          maxLength={500}
          value={reason}
          invalid={!!error}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Please split this across the correct jobs"
        />
      </FormRow>
    </Dialog>
  );
}
