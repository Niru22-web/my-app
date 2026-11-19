"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarPlus, Pencil, Plus, Users, Wallet } from "lucide-react";
import { ApiError } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { FormRow, Input, Select } from "@/components/ui/inputs";
import { Segmented } from "@/components/ui/segmented";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat";
import { useToast } from "@/components/ui/toast";
import { fullName, usePeople } from "@/components/management/api";
import { useEntities } from "@/components/accounts/api";
import {
  AMOUNT_FIELDS,
  AMOUNT_LABEL,
  monthLabel,
  usePayrollMutations,
  usePayrollRuns,
  useSalaryStructures,
  type PayrollRunSummary,
  type SalaryStructure,
} from "@/components/accounts/payroll-api";

const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function PayrollPage() {
  const [view, setView] = useState<"runs" | "structures">("runs");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Payroll"
        description="Monthly salary runs per firm: full months pay the salary structure exactly; joiners, leavers and LOP are prorated with PF, ESIC and Maharashtra PT. Finalised runs create the payables that bank reconciliation marks paid."
        actions={
          <Segmented
            aria-label="Payroll view"
            value={view}
            onChange={setView}
            options={[
              { value: "runs", label: "Monthly runs" },
              { value: "structures", label: "Salary structures" },
            ]}
          />
        }
      />
      {view === "runs" ? <Runs /> : <Structures />}
    </div>
  );
}

// ── Runs ─────────────────────────────────────────────────────────────────────

function Runs() {
  const runs = usePayrollRuns();
  const entities = useEntities();
  const m = usePayrollMutations();
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [entityId, setEntityId] = useState("");
  const [month, setMonth] = useState(thisMonth());

  const drafts = (runs.data ?? []).filter((r) => r.status === "Draft");
  const latest = (runs.data ?? []).find((r) => r.status === "Finalised");

  const columns: Column<PayrollRunSummary>[] = [
    {
      key: "month",
      header: "Month",
      sortValue: (r) => r.month,
      cell: (r) => (
        <Link href={`/accounts/payroll/${r.id}`} className="font-medium text-brand hover:underline">
          {monthLabel(r.month)}
        </Link>
      ),
    },
    { key: "firm", header: "Firm", sortValue: (r) => r.entity.name, cell: (r) => <span className="text-ink">{r.entity.name}</span> },
    { key: "people", header: "People", align: "right", sortValue: (r) => r.employees, cell: (r) => <span className="tabular">{r.employees}</span> },
    { key: "gross", header: "Gross", align: "right", hideBelow: "md", sortValue: (r) => r.gross, cell: (r) => <span className="tabular text-ink-muted">{formatCurrency(r.gross)}</span> },
    { key: "net", header: "Net pay", align: "right", sortValue: (r) => r.netPay, cell: (r) => <span className="font-semibold tabular text-ink">{formatCurrency(r.netPay)}</span> },
    {
      key: "approved",
      header: "Approved",
      align: "right",
      hideBelow: "sm",
      sortValue: (r) => r.approved / Math.max(1, r.employees),
      cell: (r) => (
        <span className={r.approved === r.employees ? "tabular text-success" : "tabular text-ink-muted"}>
          {r.approved}/{r.employees}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (r) => r.status,
      cell: (r) => (r.status === "Finalised" ? <Badge tone="success">Finalised</Badge> : <Badge tone="warning">Draft</Badge>),
    },
  ];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    m.createRun.mutate(
      { entityId, month },
      {
        onSuccess: (res) => {
          const id = (res as { data?: { id: string } }).data?.id;
          toast.success(`${monthLabel(month)} run created`);
          setOpen(false);
          if (id) router.push(`/accounts/payroll/${id}`);
        },
        onError: (err) => toast.error("Couldn’t create the run", err instanceof ApiError ? err.message : undefined),
      },
    );
  };

  if (runs.isError) return <Card><ErrorState error={runs.error} onRetry={() => runs.refetch()} /></Card>;

  return (
    <>
      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3" aria-label="Summary">
        <StatCard label="Draft runs" icon={CalendarPlus} loading={runs.isLoading} value={String(drafts.length)} tone={drafts.length ? "warning" : "neutral"} />
        <StatCard label="Last finalised" icon={Wallet} loading={runs.isLoading} value={latest ? formatCurrency(latest.netPay) : "—"} hint={latest ? `${latest.entity.name} · ${monthLabel(latest.month)}` : undefined} />
        <StatCard label="Runs on record" icon={Users} loading={runs.isLoading} value={String((runs.data ?? []).length)} />
      </section>
      <DataTable
        itemsLabel="runs"
        exportName="payroll-runs"
        rows={runs.data ?? []}
        columns={columns}
        rowKey={(r) => r.id}
        loading={runs.isLoading}
        initialSort={{ key: "month", dir: "desc" }}
        searchable
        searchPlaceholder="Search firm or month"
        toolbarActions={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> New run
          </Button>
        }
        empty={{ icon: CalendarPlus, title: "No payroll runs yet", description: "Add salary structures, then create a run for a firm and month." }}
      />
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New payroll run"
        description="Adds everyone on the firm’s payroll that month, calculated from their salary structure."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" form="new-run" loading={m.createRun.isPending} disabled={!entityId || !month}>Create run</Button>
          </>
        }
      >
        <form id="new-run" onSubmit={submit} className="space-y-4">
          <FormRow label="Firm" htmlFor="run-firm" required>
            <Select id="run-firm" value={entityId} onChange={(e) => setEntityId(e.target.value)} required>
              <option value="">Choose a firm…</option>
              {(entities.data ?? []).map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </Select>
          </FormRow>
          <FormRow label="Month" htmlFor="run-month" required>
            <Input id="run-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} required />
          </FormRow>
        </form>
      </Dialog>
    </>
  );
}

// ── Salary structures ───────────────────────────────────────────────────────

function Structures() {
  const entities = useEntities();
  const [entityId, setEntityId] = useState("");
  const [status, setStatus] = useState<"" | "Active" | "Left">("Active");
  const q = useSalaryStructures(entityId || undefined);
  const [editing, setEditing] = useState<SalaryStructure | "new" | null>(null);

  const rows = useMemo(() => (q.data ?? []).filter((s) => !status || s.status === status), [q.data, status]);
  const review = (q.data ?? []).filter((s) => s.needsReview).length;

  const columns: Column<SalaryStructure>[] = [
    {
      key: "name",
      header: "Name",
      sortValue: (s) => s.name,
      cell: (s) => (
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium text-ink">
            {s.name} {s.needsReview && <Badge tone="warning">Check</Badge>}
          </p>
          <p className="truncate text-xs text-ink-subtle">
            {[s.entity?.name, s.employee ? `portal: ${s.employee.employeeId}` : "no portal account", s.status === "Left" && s.dateOfLeaving ? `left ${formatDate(s.dateOfLeaving)}` : null].filter(Boolean).join(" · ")}
          </p>
        </div>
      ),
    },
    { key: "pf", header: "PF / ESIC", hideBelow: "md", sortValue: (s) => Number(s.pfApplicable) + Number(s.esicApplicable), cell: (s) => <span className="text-ink-muted">{[s.pfApplicable && "PF", s.esicApplicable && "ESIC"].filter(Boolean).join(" · ") || "—"}</span> },
    { key: "gross", header: "Gross", align: "right", sortValue: (s) => s.gross, cell: (s) => <span className="tabular text-ink">{formatCurrency(s.gross)}</span> },
    { key: "net", header: "Net (full month)", align: "right", hideBelow: "sm", sortValue: (s) => s.netPay, cell: (s) => <span className="font-semibold tabular text-ink">{formatCurrency(s.netPay)}</span> },
    { key: "status", header: "Status", sortValue: (s) => s.status, cell: (s) => <Badge tone={s.status === "Active" ? "success" : "neutral"}>{s.status}</Badge> },
    {
      key: "act",
      header: "",
      align: "right",
      cell: (s) => (
        <Button variant="ghost" size="sm" onClick={() => setEditing(s)} aria-label={`Edit ${s.name}`}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ];

  if (q.isError) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>;

  return (
    <>
      {review > 0 && (
        <p className="flex items-center gap-2 rounded-xl border border-warning/40 bg-warning-soft px-4 py-2.5 text-[13px] text-ink">
          <AlertTriangle className="h-4 w-4 text-warning" /> {review} structure{review === 1 ? "" : "s"} marked “Check” — confirm the amounts before the next run.
        </p>
      )}
      <DataTable
        itemsLabel="people"
        exportName="salary-structures"
        rows={rows}
        columns={columns}
        rowKey={(s) => s.id}
        loading={q.isLoading}
        initialSort={{ key: "name", dir: "asc" }}
        searchable
        searchPlaceholder="Search name"
        toolbarActions={
          <>
            <Select aria-label="Firm" value={entityId} onChange={(e) => setEntityId(e.target.value)} className="w-44">
              <option value="">All firms</option>
              {(entities.data ?? []).map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </Select>
            <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="w-32">
              <option value="Active">Active</option>
              <option value="Left">Left</option>
              <option value="">Everyone</option>
            </Select>
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" /> Add person
            </Button>
          </>
        }
        empty={{ icon: Users, title: "No salary structures yet", description: "Add each person’s full-month salary as it is actually paid." }}
      />
      {editing && <StructureDialog structure={editing === "new" ? null : editing} defaultEntityId={entityId} onClose={() => setEditing(null)} />}
    </>
  );
}

type Form = Record<string, string | boolean>;

function StructureDialog({ structure, defaultEntityId, onClose }: { structure: SalaryStructure | null; defaultEntityId: string; onClose: () => void }) {
  const entities = useEntities();
  const people = usePeople();
  const m = usePayrollMutations();
  const toast = useToast();
  const [f, setF] = useState<Form>(() => {
    const s = structure;
    const base: Form = {
      entityId: s?.entityId ?? defaultEntityId,
      name: s?.name ?? "",
      employeeId: s?.employeeId ?? "",
      gender: s?.gender ?? "",
      status: s?.status ?? "Active",
      dateOfJoining: s?.dateOfJoining ?? "",
      dateOfLeaving: s?.dateOfLeaving ?? "",
      pfApplicable: s?.pfApplicable ?? false,
      esicApplicable: s?.esicApplicable ?? false,
      basicPct: s?.basicPct != null ? String(Math.round(s.basicPct * 10000) / 100) : "",
      ctc: s?.ctc != null ? String(s.ctc) : "",
      needsReview: s?.needsReview ?? false,
    };
    for (const k of AMOUNT_FIELDS) base[k] = s ? String(s[k]) : "0";
    return base;
  });
  const set = (k: string, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  const num = (k: string) => Number(f[k] || 0);
  const gross = num("basic") + num("hra") + num("conv") + num("bonus");
  const net = gross - num("pt") - num("pfEmployee") - num("esicEmployee");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = {
      name: f.name,
      employeeId: f.employeeId || null,
      gender: f.gender || null,
      status: f.status,
      dateOfJoining: f.dateOfJoining || null,
      dateOfLeaving: f.dateOfLeaving || null,
      pfApplicable: f.pfApplicable,
      esicApplicable: f.esicApplicable,
      basicPct: f.basicPct === "" ? null : Number(f.basicPct) / 100,
      ctc: f.ctc === "" ? null : Number(f.ctc),
      needsReview: f.needsReview,
    };
    for (const k of AMOUNT_FIELDS) body[k] = num(k);
    const done = {
      onSuccess: () => {
        toast.success(structure ? "Salary structure updated" : "Person added to payroll");
        onClose();
      },
      onError: (err: unknown) => toast.error("Couldn’t save", err instanceof ApiError ? err.message : undefined),
    };
    if (structure) m.updateStructure.mutate({ id: structure.id, ...body } as never, done);
    else m.createStructure.mutate({ entityId: f.entityId, ...body } as never, done);
  };

  const people_ = (people.data ?? []) as { id: string; firstName?: string; lastName?: string; employeeId?: string }[];

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={structure ? `Edit ${structure.name}` : "Add person to payroll"}
      description="The full-month salary exactly as paid. Partial months are prorated from this when a run is created."
      footer={
        <>
          <span className="mr-auto text-[13px] text-ink-muted">
            Gross <b className="tabular text-ink">{formatCurrency(gross)}</b> · Net <b className="tabular text-ink">{formatCurrency(net)}</b>
          </span>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="structure-form" loading={m.createStructure.isPending || m.updateStructure.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form id="structure-form" onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormRow label="Firm" htmlFor="st-firm" required hint={structure ? "Moving to another firm = add them there as a new person." : undefined}>
            <Select id="st-firm" value={String(f.entityId)} onChange={(e) => set("entityId", e.target.value)} disabled={!!structure} required>
              <option value="">Choose a firm…</option>
              {(entities.data ?? []).map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </Select>
          </FormRow>
          <FormRow label="Name (as on the salary sheet)" htmlFor="st-name" required>
            <Input id="st-name" value={String(f.name)} onChange={(e) => set("name", e.target.value)} required />
          </FormRow>
          <FormRow label="Portal account" htmlFor="st-emp" hint="Linked people get a payables entry when the month is finalised, and their portal time counts as their timesheet.">
            <Select id="st-emp" value={String(f.employeeId)} onChange={(e) => set("employeeId", e.target.value)}>
              <option value="">Not linked</option>
              {people_.map((p) => (
                <option key={p.id} value={p.id}>{`${fullName(p)}${p.employeeId ? ` (${p.employeeId})` : ""}`}</option>
              ))}
            </Select>
          </FormRow>
          <FormRow label="Gender" htmlFor="st-gender" hint="Needed for professional tax on partial months.">
            <Select id="st-gender" value={String(f.gender)} onChange={(e) => set("gender", e.target.value)}>
              <option value="">Not recorded</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
            </Select>
          </FormRow>
          <FormRow label="Joined" htmlFor="st-doj">
            <Input id="st-doj" type="date" value={String(f.dateOfJoining)} onChange={(e) => set("dateOfJoining", e.target.value)} />
          </FormRow>
          <FormRow label="Left" htmlFor="st-dol">
            <Input id="st-dol" type="date" value={String(f.dateOfLeaving)} onChange={(e) => set("dateOfLeaving", e.target.value)} />
          </FormRow>
          <FormRow label="Status" htmlFor="st-status">
            <Select id="st-status" value={String(f.status)} onChange={(e) => set("status", e.target.value)}>
              <option value="Active">Active</option>
              <option value="Left">Left</option>
            </Select>
          </FormRow>
          <div className="flex flex-wrap items-end gap-5 pb-2 text-sm text-ink">
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!f.pfApplicable} onChange={(e) => set("pfApplicable", e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" /> PF applies</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!f.esicApplicable} onChange={(e) => set("esicApplicable", e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" /> ESIC applies</label>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormRow label="Basic %" htmlFor="st-pct" hint="Used when prorating, e.g. 50.">
            <Input id="st-pct" type="number" min={0} max={100} step="0.01" value={String(f.basicPct)} onChange={(e) => set("basicPct", e.target.value)} />
          </FormRow>
          <FormRow label="Annual CTC" htmlFor="st-ctc">
            <Input id="st-ctc" type="number" min={0} step="1" value={String(f.ctc)} onChange={(e) => set("ctc", e.target.value)} />
          </FormRow>
          {AMOUNT_FIELDS.map((k) => (
            <FormRow key={k} label={AMOUNT_LABEL[k]} htmlFor={`st-${k}`}>
              <Input id={`st-${k}`} type="number" min={0} step="0.01" value={String(f[k])} onChange={(e) => set(k, e.target.value)} />
            </FormRow>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={!!f.needsReview} onChange={(e) => set("needsReview", e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" /> Mark “Check” — the amounts still need confirming
        </label>
        {structure?.structureSource && <p className="text-xs text-ink-subtle">{structure.structureSource}</p>}
      </form>
    </Dialog>
  );
}
