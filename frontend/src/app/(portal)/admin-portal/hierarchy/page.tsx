"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Download, GitBranch, Search, Users } from "lucide-react";
import { api } from "@/lib/api";
import { roleLabel } from "@/lib/roles";
import type { Envelope } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/inputs";
import { Segmented } from "@/components/ui/segmented";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadCsv } from "@/components/claims/claim-tabs";

interface Emp {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string | null;
  role: string | null;
  department: string | null;
  designation: string | null;
  status: string | null;
  managerId: string | null;
  partnerId: string | null;
  subManagerId: string | null;
  reportingManagerIds: string[] | null;
  reportingPartnerIds: string[] | null;
  subManagerIds: string[] | null;
}
type Row = Emp & { managers: string[]; partners: string[]; subs: string[]; reports: number };

const uniq = (...ids: (string | null | undefined | (string | null)[])[]) => [...new Set(ids.flat().filter(Boolean) as string[])];
const nameOf = (e?: Pick<Emp, "firstName" | "lastName">) => (e ? `${e.firstName} ${e.lastName ?? ""}`.trim() : "—");

export default function HierarchyPage() {
  const router = useRouter();
  const q = useQuery({
    queryKey: ["admin", "hierarchy"],
    queryFn: async () => {
      const res = await api<Envelope<Emp[]> | Emp[]>("employees", { query: { all: "true" } });
      return Array.isArray(res) ? res : (res.data ?? []);
    },
  });
  const [view, setView] = useState<"all" | "nomanager" | "leads">("all");
  const [dept, setDept] = useState("");
  const [search, setSearch] = useState("");

  const { rows, byId } = useMemo(() => {
    const active = (q.data ?? []).filter((e) => (e.status ?? "active").toLowerCase() === "active");
    const byId = new Map(active.map((e) => [e.id, e]));
    const reportCount = new Map<string, number>();
    const rows: Row[] = active.map((e) => {
      const managers = uniq(e.managerId, e.reportingManagerIds ?? []);
      const partners = uniq(e.partnerId, e.reportingPartnerIds ?? []);
      const subs = uniq(e.subManagerId, e.subManagerIds ?? []);
      for (const id of uniq(managers, subs)) reportCount.set(id, (reportCount.get(id) ?? 0) + 1);
      return { ...e, managers, partners, subs, reports: 0 };
    });
    for (const r of rows) r.reports = reportCount.get(r.id) ?? 0;
    return { rows, byId };
  }, [q.data]);

  const depts = useMemo(() => [...new Set(rows.map((r) => r.department).filter(Boolean) as string[])].sort(), [rows]);
  const noManager = rows.filter((r) => !r.managers.length && !r.partners.length && !["admin", "owner", "partner"].includes((r.role ?? "").toLowerCase()));
  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    const base = view === "nomanager" ? noManager : view === "leads" ? rows.filter((r) => r.reports > 0) : rows;
    return base.filter(
      (r) =>
        (!dept || r.department === dept) &&
        (!s || [nameOf(r), r.employeeId, ...r.managers.map((id) => nameOf(byId.get(id))), ...r.partners.map((id) => nameOf(byId.get(id)))].join(" ").toLowerCase().includes(s)),
    );
  }, [rows, noManager, view, dept, search, byId]);

  const names = (ids: string[]) => ids.map((id) => nameOf(byId.get(id))).filter((n) => n !== "—");
  const people = (ids: string[]) => {
    const n = names(ids);
    return n.length ? <span className="text-ink">{n.join(", ")}</span> : <span className="text-ink-subtle">—</span>;
  };

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Person",
      sortValue: (r) => nameOf(r),
      cell: (r) => (
        <div className="w-44 sm:w-56">
          <p className="truncate font-medium text-ink">{nameOf(r)}</p>
          <p className="truncate text-xs text-ink-subtle">{[roleLabel(r.role), r.department].filter(Boolean).join(" · ")}</p>
        </div>
      ),
    },
    { key: "managers", header: "Manager(s)", sortValue: (r) => names(r.managers).join(), cell: (r) => people(r.managers) },
    { key: "subs", header: "Sub-manager(s)", hideBelow: "lg", sortValue: (r) => names(r.subs).join(), cell: (r) => people(r.subs) },
    { key: "partners", header: "Partner(s)", hideBelow: "md", sortValue: (r) => names(r.partners).join(), cell: (r) => people(r.partners) },
    { key: "reports", header: "Team", align: "right", sortValue: (r) => r.reports, cell: (r) => (r.reports ? <Badge tone="brand">{r.reports}</Badge> : <span className="text-ink-subtle">—</span>) },
  ];

  if (q.isError)
    return (
      <Card>
        <ErrorState error={q.error} message="The hierarchy couldn’t be loaded." onRetry={() => q.refetch()} />
      </Card>
    );

  const leads = [...rows].filter((r) => r.reports > 0).sort((a, b) => b.reports - a.reports).slice(0, 8);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organisation hierarchy"
        description="Reporting lines across active employees. Select any person to view or update their managers and partners."
        actions={
          <Button
            variant="secondary"
            disabled={!shown.length}
            onClick={() =>
              downloadCsv(
                "reporting-lines.csv",
                ["Employee code", "Name", "Role", "Department", "Managers", "Sub-managers", "Partners", "Direct team"],
                shown.map((r) => [r.employeeId, nameOf(r), roleLabel(r.role), r.department, names(r.managers).join("; "), names(r.subs).join("; "), names(r.partners).join("; "), r.reports]),
              )
            }
          >
            <Download className="h-4 w-4" /> Export
          </Button>
        }
      />

      {!q.isLoading && noManager.length > 0 && (
        <button onClick={() => setView("nomanager")} className="flex w-full items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4 text-left">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
          <span className="text-[13px] text-ink">
            <strong>{noManager.length} active {noManager.length === 1 ? "person has" : "people have"} no manager or partner.</strong> Their timesheets, leave and claims have no one to approve them. Click a person below to assign their reporting line.
          </span>
        </button>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Segmented
              aria-label="Show"
              value={view}
              onChange={setView}
              options={[
                { value: "all", label: "Everyone", count: rows.length || undefined },
                { value: "leads", label: "People with a team" },
                { value: "nomanager", label: "No manager", count: noManager.length || undefined },
              ]}
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              {depts.length > 1 && (
                <Select aria-label="Department" value={dept} onChange={(e) => setDept(e.target.value)} className="sm:w-44">
                  <option value="">All departments</option>
                  {depts.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </Select>
              )}
              <div className="relative sm:w-56">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
                <Input placeholder="Search people" aria-label="Search people" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
            </div>
          </div>
          <DataTable
        exportName={false}
            rows={shown}
            columns={columns}
            rowKey={(r) => r.id}
            loading={q.isLoading}
            onRowClick={(r) => router.push(`/management/employees/edit/${r.id}`)}
            initialSort={{ key: "name", dir: "asc" }}
            pageSize={25}
            empty={{ icon: Users, title: "No one matches" }}
          />
        </div>

        <Card className="self-start">
          <CardHeader icon={GitBranch} title="Largest teams" description="Direct reports (as manager or sub-manager)" />
          {q.isLoading ? (
            <Skeleton className="m-5 h-40" />
          ) : !leads.length ? (
            <p className="p-5 text-sm text-ink-subtle">No reporting lines recorded yet.</p>
          ) : (
            <ul className="space-y-3 p-5">
              {leads.map((l) => (
                <li key={l.id}>
                  <div className="flex justify-between text-[13px]">
                    <span className="truncate text-ink">{nameOf(l)}</span>
                    <span className="font-semibold tabular text-ink">{l.reports}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${(l.reports / leads[0].reports) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
