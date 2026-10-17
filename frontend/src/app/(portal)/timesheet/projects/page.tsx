"use client";

import { useMemo, useState } from "react";
import { FolderKanban } from "lucide-react";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, statusTone } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { useMyProjects, type MyProject } from "@/components/timesheet/api";
import { hhmm } from "@/components/timesheet/hours";

/** Projects I'm on (project team or a job in it) or have logged time on. */
export default function MyProjectsPage() {
  const q = useMyProjects();
  const [status, setStatus] = useState("all");

  const statuses = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of q.data ?? []) m.set(p.status || "—", (m.get(p.status || "—") ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [q.data]);
  const rows = (q.data ?? []).filter((p) => status === "all" || (p.status || "—") === status);

  const columns: Column<MyProject>[] = [
    {
      key: "project",
      header: "Project",
      cell: (p) => (
        <span className="block min-w-0 max-w-[300px]">
          <span className="block truncate font-medium text-ink">
            {p.name} <span className="font-normal text-ink-subtle">({p.client.name})</span>
          </span>
          <span className="block text-xs text-ink-subtle">
            {p.projectId} · {p.billable ? "Billable" : "Non-billable"}
            {p.member ? " · on the project team" : ""}
          </span>
        </span>
      ),
      sortValue: (p) => p.name,
      exportValue: (p) => `${p.name} (${p.client.name})`,
      searchValue: (p) => `${p.name} ${p.projectId} ${p.client.name}`,
      exportHeader: "Project (Client)",
    },
    { key: "start", header: "Start date", cell: (p) => formatDate(p.startDate), sortValue: (p) => p.startDate ?? "", exportValue: (p) => (p.startDate ?? "").slice(0, 10), className: "hidden 2xl:table-cell", headerClassName: "hidden 2xl:table-cell" },
    { key: "end", header: "End date", cell: (p) => formatDate(p.endDate), sortValue: (p) => p.endDate ?? "", exportValue: (p) => (p.endDate ?? "").slice(0, 10), className: "hidden 2xl:table-cell", headerClassName: "hidden 2xl:table-cell" },
    { key: "status", header: "Status", cell: (p) => <Badge tone={statusTone(p.status)}>{p.status || "—"}</Badge>, sortValue: (p) => p.status },
    {
      key: "jobs",
      header: "Jobs",
      align: "right",
      cell: (p) => (
        <span title={`${p.openJobsCount} open`}>
          {p.jobsCount}
          <span className="text-xs text-ink-subtle"> ({p.openJobsCount} open)</span>
        </span>
      ),
      sortValue: (p) => p.jobsCount,
      hideBelow: "md",
    },
    { key: "month", header: "My hours (month)", exportHeader: "My hours (this month)", align: "right", cell: (p) => <span className="font-mono">{hhmm(p.myHoursMonth)}</span>, sortValue: (p) => p.myHoursMonth },
    { key: "mine", header: "My hours (all time)", align: "right", cell: (p) => <span className="font-mono font-semibold">{hhmm(p.myHoursTotal)}</span>, sortValue: (p) => p.myHoursTotal },
    { key: "team", header: "Team hours", align: "right", cell: (p) => <span className="font-mono text-ink-muted">{hhmm(p.teamHours)}</span>, sortValue: (p) => p.teamHours, hideBelow: "md" },
    {
      key: "billable",
      header: "Billable",
      cell: (p) => (p.billable ? <Badge tone="brand">Billable</Badge> : <Badge>Non-billable</Badge>),
      sortValue: (p) => (p.billable ? "Billable" : "Non-billable"),
      className: "hidden 2xl:table-cell",
      headerClassName: "hidden 2xl:table-cell",
    },
    { key: "users", header: "Users", align: "right", cell: (p) => p.usersCount, sortValue: (p) => p.usersCount, className: "hidden 2xl:table-cell", headerClassName: "hidden 2xl:table-cell" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="My projects" description="Projects you’re on or have logged time on. Team hours are everyone’s time on the project." />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(p) => p.id}
        loading={q.isLoading}
        error={q.isError}
        onRetry={() => q.refetch()}
        searchable
        searchPlaceholder="Search projects or clients…"
        filterTabs={[{ key: "all", label: "All", count: q.data?.length ?? 0 }, ...statuses.map(([s, n]) => ({ key: s, label: s, count: n }))]}
        activeFilterTab={status}
        onFilterTabChange={setStatus}
        exportName="my-projects"
        itemsLabel="projects"
        initialSort={{ key: "mine", dir: "desc" }}
        empty={{ icon: FolderKanban, title: "No projects yet", description: "Projects appear here once you’re added to a project or job team, or log time on one." }}
      />
    </div>
  );
}
