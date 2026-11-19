"use client";

import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, Clock3, Coins, Layers, Pencil, Users } from "lucide-react";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { FormRow, Input, Select } from "@/components/ui/inputs";
import { Segmented } from "@/components/ui/segmented";
import { StatCard } from "@/components/ui/stat";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useEntities } from "@/components/accounts/api";
import { monthName, useCostAllocation, useCostMonths, useMisMutations, useReportingMap, type AllocationRow, type CostSource, type ReportingClient, type ReportingMapping } from "@/components/accounts/mis-api";
import { inr, monthsBetween, MonthRange } from "@/components/accounts/mis-parts";

type GroupBy = "reportingClient" | "project" | "partner" | "verticalHead" | "serviceCategory" | "person";
const GROUP_LABEL: Record<GroupBy, string> = {
  reportingClient: "Client",
  project: "Project",
  partner: "Engagement partner",
  verticalHead: "Vertical head",
  serviceCategory: "Service category",
  person: "Person",
};

export default function CostAllocationPage() {
  const [view, setView] = useState<"allocation" | "mapping">("allocation");
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-[13px] text-ink-muted">
          Each person’s monthly cost is split across clients and projects in proportion to the hours they logged in the portal. Cost comes from finalised payroll runs (gross + employer PF/ESIC) or from Tally salary/consultant expenses.
        </p>
        <Segmented aria-label="View" value={view} onChange={setView} options={[{ value: "allocation", label: "Allocation" }, { value: "mapping", label: "Client & project mapping" }]} />
      </div>
      {view === "allocation" ? <Allocation /> : <Mapping />}
    </div>
  );
}

function Allocation() {
  const [source, setSource] = useState<CostSource>("payroll");
  const months = useCostMonths(source);
  const all = useMemo(() => months.data ?? [], [months.data]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const onRange = useCallback((f: string, t: string) => (setFrom(f), setTo(t)), []);
  const [entityId, setEntityId] = useState("");
  const [by, setBy] = useState<GroupBy>("reportingClient");
  const entities = useEntities();
  const chosen = useMemo(() => (from && to ? monthsBetween(all, from, to) : []), [all, from, to]);
  const q = useCostAllocation(source, chosen, entityId || undefined);

  const groups = useMemo(() => {
    const acc = new Map<string, { key: string; hours: number; cost: number; people: Set<string> }>();
    for (const r of q.data?.rows ?? []) {
      const key = (by === "project" ? `${r.client} · ${r.project ?? "—"}` : (r[by as keyof AllocationRow] as string | null)) || "Unassigned";
      const cur = acc.get(key) ?? { key, hours: 0, cost: 0, people: new Set<string>() };
      cur.hours += r.hours;
      cur.cost += r.allocated;
      cur.people.add(r.employeeId);
      acc.set(key, cur);
    }
    return [...acc.values()].map((g) => ({ key: g.key, hours: Math.round(g.hours * 10) / 10, cost: g.cost, people: g.people.size }));
  }, [q.data, by]);
  const allocated = groups.reduce((a, g) => a + g.cost, 0);
  const hours = groups.reduce((a, g) => a + g.hours, 0);
  const unalloc = q.data?.unallocated ?? [];
  const unallocTotal = unalloc.reduce((a, u) => a + u.cost, 0);

  const columns: Column<(typeof groups)[number]>[] = [
    { key: "key", header: GROUP_LABEL[by], sortValue: (g) => g.key, cell: (g) => <span className={g.key === "Unassigned" ? "text-ink-subtle" : "font-medium text-ink"}>{g.key}</span> },
    { key: "hours", header: "Hours", align: "right", sortValue: (g) => g.hours, cell: (g) => <span className="tabular text-ink-muted">{g.hours.toLocaleString("en-IN")}</span> },
    { key: "people", header: "People", align: "right", hideBelow: "sm", sortValue: (g) => g.people, cell: (g) => <span className="tabular text-ink-muted">{g.people}</span> },
    { key: "cost", header: "Allocated cost", align: "right", sortValue: (g) => g.cost, cell: (g) => <span className="font-semibold tabular text-ink">{inr(g.cost)}</span> },
    { key: "share", header: "Share", align: "right", hideBelow: "md", sortValue: (g) => g.cost, cell: (g) => <span className="tabular text-ink-subtle">{allocated ? `${Math.round((g.cost / allocated) * 100)}%` : "—"}</span> },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented aria-label="Cost source" value={source} onChange={(v) => (setSource(v), setFrom(""), setTo(""))} options={[{ value: "payroll", label: "Payroll" }, { value: "tally", label: "Tally" }]} />
        <MonthRange months={all} from={from} to={to} onChange={onRange} />
        <Select aria-label="Firm" value={entityId} onChange={(e) => setEntityId(e.target.value)} className="w-44">
          <option value="">All firms</option>
          {(entities.data ?? []).map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </Select>
        <Select aria-label="Group by" value={by} onChange={(e) => setBy(e.target.value as GroupBy)} className="ml-auto w-48">
          {(Object.keys(GROUP_LABEL) as GroupBy[]).map((k) => (
            <option key={k} value={k}>By {GROUP_LABEL[k].toLowerCase()}</option>
          ))}
        </Select>
      </div>

      {months.isLoading ? (
        <Skeleton className="h-64" />
      ) : !all.length ? (
        <Card>
          <EmptyState
            icon={Coins}
            title={source === "payroll" ? "No finalised payroll runs yet" : "No Tally data yet"}
            description={source === "payroll" ? "Finalise a month under Accounts → Payroll and its salary cost appears here, split by timesheet hours." : "Import Tally registers and link people under Tally import → Parties."}
          />
        </Card>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="Totals">
            <StatCard label="Allocated cost" icon={Coins} tone="brand" loading={q.isLoading} value={inr(allocated)} hint={`${chosen.length} month${chosen.length === 1 ? "" : "s"}`} />
            <StatCard label="Hours" icon={Clock3} loading={q.isLoading} value={hours.toLocaleString("en-IN")} />
            <StatCard label="Groups" icon={Layers} loading={q.isLoading} value={String(groups.length)} hint={GROUP_LABEL[by]} />
            <StatCard label="Not allocated" icon={AlertTriangle} tone={unalloc.length ? "warning" : "neutral"} loading={q.isLoading} value={inr(unallocTotal)} hint={`${unalloc.length} person-month${unalloc.length === 1 ? "" : "s"}`} />
          </section>
          {q.isError ? (
            <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>
          ) : (
            <DataTable itemsLabel="groups" exportName={`cost-allocation-${by}`} rows={groups} columns={columns} rowKey={(g) => g.key} loading={q.isLoading} initialSort={{ key: "cost", dir: "desc" }} searchable searchPlaceholder={`Search ${GROUP_LABEL[by].toLowerCase()}`} />
          )}
          {unalloc.length > 0 && (
            <Card>
              <CardHeader icon={AlertTriangle} title="Cost that couldn’t be allocated" description="Fix these so every rupee of cost reaches a client." />
              <ul className="divide-y divide-line px-5 pb-3">
                {unalloc.map((u, i) => (
                  <li key={`${u.person}-${u.month}-${i}`} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                    <span className="min-w-0">
                      <span className="font-medium text-ink">{u.person}</span>
                      <span className="text-ink-subtle"> · {monthName(u.month)} · {u.reason}</span>
                    </span>
                    <span className="shrink-0 tabular text-ink">{inr(u.cost)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </>
  );
}

// ── Mapping (MIS client_project_master) ─────────────────────────────────────

interface MapRow {
  key: string;
  clientId: string;
  projectId: string | null;
  client: string;
  project: string | null;
  partner: string | null;
  mapping: ReportingMapping | null;
}

function Mapping() {
  const q = useReportingMap();
  const [filter, setFilter] = useState<"all" | "unmapped">("all");
  const [editing, setEditing] = useState<MapRow | null>(null);
  const rows = useMemo(() => {
    const out: MapRow[] = [];
    for (const c of q.data ?? []) {
      out.push({ key: c.id, clientId: c.id, projectId: null, client: c.name, project: null, partner: null, mapping: c.mapping });
      for (const p of c.projects) out.push({ key: `${c.id}|${p.id}`, clientId: c.id, projectId: p.id, client: c.name, project: p.name, partner: p.partner, mapping: p.mapping });
    }
    return out;
  }, [q.data]);
  const clientDefault = useMemo(() => new Map((q.data ?? []).map((c: ReportingClient) => [c.id, c.mapping])), [q.data]);
  const effective = (r: MapRow, k: keyof ReportingMapping) => (r.mapping?.[k] as string | null) || (r.projectId ? (clientDefault.get(r.clientId)?.[k] as string | null) : null) || null;
  const shown = rows.filter((r) => filter === "all" || !effective(r, "verticalHead") || !effective(r, "serviceCategory"));

  const columns: Column<MapRow>[] = [
    {
      key: "what",
      header: "Client / project",
      sortValue: (r) => `${r.client} ${r.project ?? ""}`,
      cell: (r) => (r.projectId ? <span className="pl-4 text-ink">↳ {r.project}</span> : <span className="font-semibold text-ink">{r.client} <span className="font-normal text-ink-subtle">(client default)</span></span>),
    },
    { key: "rc", header: "Reporting client", hideBelow: "md", cell: (r) => <Val v={r.mapping?.reportingClientName} inherited={r.projectId ? effective(r, "reportingClientName") : null} /> },
    { key: "sc", header: "Service category", cell: (r) => <Val v={r.mapping?.serviceCategory} inherited={r.projectId ? effective(r, "serviceCategory") : null} /> },
    { key: "vh", header: "Vertical head", cell: (r) => <Val v={r.mapping?.verticalHead} inherited={r.projectId ? effective(r, "verticalHead") : null} /> },
    { key: "ep", header: "Partner", hideBelow: "lg", cell: (r) => <Val v={r.mapping?.engagementPartner} inherited={r.partner} /> },
    { key: "act", header: "", align: "right", cell: (r) => <Button variant="ghost" size="sm" onClick={() => setEditing(r)} aria-label="Edit mapping"><Pencil className="h-3.5 w-3.5" /></Button> },
  ];

  if (q.isError) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>;
  return (
    <>
      <DataTable
        itemsLabel="rows"
        exportName="client-project-mapping"
        rows={shown}
        columns={columns}
        rowKey={(r) => r.key}
        loading={q.isLoading}
        searchable
        searchPlaceholder="Search client or project"
        filterTabs={[{ key: "all", label: "Everything", count: rows.length }, { key: "unmapped", label: "Missing vertical/service", count: rows.filter((r) => !effective(r, "verticalHead") || !effective(r, "serviceCategory")).length }]}
        activeFilterTab={filter}
        onFilterTabChange={(v) => setFilter(v as typeof filter)}
        empty={{ icon: Users, title: "No clients yet" }}
      />
      {editing && <MappingDialog row={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function Val({ v, inherited }: { v?: string | null; inherited?: string | null }) {
  if (v) return <span className="text-ink">{v}</span>;
  if (inherited) return <span className="text-ink-subtle">{inherited}</span>;
  return <span className="text-ink-subtle">—</span>;
}

function MappingDialog({ row, onClose }: { row: MapRow; onClose: () => void }) {
  const m = useMisMutations();
  const toast = useToast();
  const [f, setF] = useState({
    reportingClientName: row.mapping?.reportingClientName ?? "",
    serviceCategory: row.mapping?.serviceCategory ?? "",
    verticalHead: row.mapping?.verticalHead ?? "",
    engagementPartner: row.mapping?.engagementPartner ?? "",
  });
  const save = () =>
    m.setMapping.mutate(
      { clientId: row.clientId, projectId: row.projectId, ...f },
      {
        onSuccess: () => {
          toast.success("Mapping saved");
          onClose();
        },
        onError: (e) => toast.error("Couldn’t save", e instanceof ApiError ? e.message : undefined),
      },
    );
  return (
    <Dialog
      open
      onClose={onClose}
      title={row.projectId ? `${row.client} · ${row.project}` : `${row.client} (client default)`}
      description={row.projectId ? "Blank fields use the client default." : "Used for every project of this client that doesn’t set its own."}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={m.setMapping.isPending}>Save</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Reporting client" htmlFor="rm-rc" hint="Groups related entities, e.g. a group company.">
          <Input id="rm-rc" value={f.reportingClientName} onChange={(e) => setF({ ...f, reportingClientName: e.target.value })} placeholder={row.client} />
        </FormRow>
        <FormRow label="Service category" htmlFor="rm-sc">
          <Input id="rm-sc" value={f.serviceCategory} onChange={(e) => setF({ ...f, serviceCategory: e.target.value })} placeholder="e.g. Statutory Audit" />
        </FormRow>
        <FormRow label="Vertical head" htmlFor="rm-vh">
          <Input id="rm-vh" value={f.verticalHead} onChange={(e) => setF({ ...f, verticalHead: e.target.value })} />
        </FormRow>
        <FormRow label="Engagement partner" htmlFor="rm-ep" hint={row.partner ? `Portal record: ${row.partner}` : undefined}>
          <Input id="rm-ep" value={f.engagementPartner} onChange={(e) => setF({ ...f, engagementPartner: e.target.value })} placeholder={row.partner ?? ""} />
        </FormRow>
      </div>
    </Dialog>
  );
}
