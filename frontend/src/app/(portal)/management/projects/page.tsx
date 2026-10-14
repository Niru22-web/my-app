"use client";

import { useMemo, useState } from "react";
import { BriefcaseBusiness, CheckCircle2, Download, FolderKanban, MessagesSquare, Pencil, Plus, Power, Search, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { fmtDay, today, workDate } from "@/lib/dates";
import { formatHours, formatNumber, plural } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/inputs";
import { Segmented } from "@/components/ui/segmented";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ConfirmDialog } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { downloadCsv } from "@/components/claims/claim-tabs";
import { canDeleteProject, canManageWork, isInactive, projectBody, useMgmtMutations, useProjectList, workTone, type Project } from "@/components/management/api";
import { ProjectDialog } from "@/components/management/project-dialog";
import { RowMenu } from "@/components/management/row-menu";
import { TeamStack } from "@/components/management/team-stack";

type StatusF = "live" | "Completed" | "Inactive" | "all";

export default function ProjectsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const manage = canManageWork(user?.role);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusF>("live");
  const [client, setClient] = useState("");
  const [editor, setEditor] = useState<{ project?: Project | null } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "toggle" | "delete"; project: Project } | null>(null);

  const q = useProjectList();
  const m = useMgmtMutations();
  const all = useMemo(() => q.data ?? [], [q.data]);
  const clients = useMemo(() => [...new Map(all.filter((p) => p.client).map((p) => [p.clientId, p.client!.name])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [all]);

  const rows = all.filter((p) => {
    const s = p.status.toLowerCase();
    if (status === "live" && (s === "completed" || s === "inactive")) return false;
    if ((status === "Completed" || status === "Inactive") && p.status !== status) return false;
    if (client && p.clientId !== client) return false;
    const t = search.trim().toLowerCase();
    return !t || `${p.name} ${p.projectId} ${p.client?.name ?? ""} ${p.contactPerson ?? ""}`.toLowerCase().includes(t);
  });

  const columns: Column<Project>[] = [
    {
      key: "name",
      header: "Project",
      sortValue: (p) => p.name,
      cell: (p) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{p.name}</p>
          <p className="truncate text-xs text-ink-subtle">
            {p.projectId} · {p.client?.name ?? "—"}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (p) => p.status,
      cell: (p) => (
        <div className="flex flex-col items-start gap-1">
          <Badge tone={workTone(p.status)}>{p.status}</Badge>
          <span className="text-[11px] text-ink-subtle">{p.billable ? "Billable" : "Non-billable"}</span>
        </div>
      ),
    },
    { key: "team", header: "Team", hideBelow: "md", cell: (p) => <TeamStack users={p.users} /> },
    { key: "jobs", header: "Jobs", align: "right", hideBelow: "sm", sortValue: (p) => p._count?.jobs ?? 0, cell: (p) => formatNumber(p._count?.jobs ?? 0) },
    { key: "hours", header: "Hours", align: "right", sortValue: (p) => p.loggedHours ?? 0, cell: (p) => formatHours(p.loggedHours ?? 0) },
    {
      key: "dates",
      header: "Timeline",
      hideBelow: "lg",
      sortValue: (p) => p.startDate,
      cell: (p) => (
        <span className="whitespace-nowrap text-ink-muted">
          {fmtDay(workDate(p.startDate), { day: "numeric", month: "short", year: "numeric" })}
          {p.endDate ? ` – ${fmtDay(workDate(p.endDate), { day: "numeric", month: "short", year: "numeric" })}` : ""}
        </span>
      ),
    },
    {
      key: "act",
      header: "",
      align: "right",
      cell: (p) =>
        manage ? (
          <RowMenu
            items={[
              { label: "Edit project", icon: <Pencil className="h-4 w-4" />, onClick: () => setEditor({ project: p }) },
              { label: isInactive(p.status) ? "Reactivate (Started)" : "Mark inactive", icon: <Power className="h-4 w-4" />, onClick: () => setConfirm({ kind: "toggle", project: p }) },
              ...(canDeleteProject(user?.role)
                ? [
                    {
                      label: "Delete project",
                      icon: <Trash2 className="h-4 w-4" />,
                      danger: true,
                      onClick: () => setConfirm({ kind: "delete", project: p }),
                      disabledReason: (p.loggedHours ?? 0) > 0 ? "Time has been logged — mark inactive instead" : undefined,
                    },
                  ]
                : []),
            ]}
          />
        ) : null,
    },
  ];

  const live = all.filter((p) => !["completed", "inactive"].includes(p.status.toLowerCase()));
  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Client engagements. Time and expenses are recorded against a project’s jobs."
        actions={
          <>
            <Button
              variant="secondary"
              disabled={!rows.length}
              onClick={() =>
                downloadCsv(
                  `projects-${today()}.csv`,
                  ["Project code", "Name", "Client", "Status", "Billable", "Start date", "End date", "Contact person", "Jobs", "Team", "Logged hours"],
                  rows.map((p) => [p.projectId, p.name, p.client?.name, p.status, p.billable ? "Yes" : "No", workDate(p.startDate), p.endDate ? workDate(p.endDate) : "", p.contactPerson, p._count?.jobs ?? 0, p.users?.length ?? 0, p.loggedHours ?? 0]),
                )
              }
            >
              <Download className="h-4 w-4" /> Export
            </Button>
            {manage && (
              <Button onClick={() => setEditor({})}>
                <Plus className="h-4 w-4" /> New project
              </Button>
            )}
          </>
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="Summary">
        <StatCard label="Live projects" icon={FolderKanban} tone="brand" loading={q.isLoading} value={formatNumber(live.length)} hint={`of ${formatNumber(all.length)}`} />
        <StatCard label="Billable (live)" icon={BriefcaseBusiness} loading={q.isLoading} value={formatNumber(live.filter((p) => p.billable).length)} />
        <StatCard label="In discussion" icon={MessagesSquare} loading={q.isLoading} value={formatNumber(all.filter((p) => p.status === "In-Discussion").length)} />
        <StatCard label="Completed" icon={CheckCircle2} loading={q.isLoading} value={formatNumber(all.filter((p) => p.status === "Completed").length)} />
      </section>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Segmented
          aria-label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "live", label: "Live" },
            { value: "Completed", label: "Completed" },
            { value: "Inactive", label: "Inactive" },
            { value: "all", label: "All" },
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select aria-label="Client" value={client} onChange={(e) => setClient(e.target.value)} className="sm:w-56">
            <option value="">All clients</option>
            {clients.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
            <Input placeholder="Search projects" aria-label="Search projects" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(p) => p.id}
        loading={q.isLoading}
        error={q.isError}
        onRetry={() => q.refetch()}
        onRowClick={manage ? (p) => setEditor({ project: p }) : undefined}
        initialSort={{ key: "dates", dir: "desc" }}
        pageSize={20}
        empty={{ icon: FolderKanban, title: search || client ? "No projects match these filters" : "No projects here yet" }}
      />

      <ProjectDialog open={!!editor} onClose={() => setEditor(null)} project={editor?.project} />

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        tone={confirm?.kind === "delete" ? "danger" : "primary"}
        title={confirm?.kind === "delete" ? `Delete ${confirm.project.name}?` : confirm && isInactive(confirm.project.status) ? `Reactivate ${confirm.project.name}?` : `Mark ${confirm?.project.name} inactive?`}
        confirmLabel={confirm?.kind === "delete" ? "Delete permanently" : confirm && isInactive(confirm.project.status) ? "Reactivate" : "Mark inactive"}
        busy={m.saveProject.isPending || m.deleteProject.isPending}
        description={
          confirm?.kind === "delete"
            ? `No time has been logged on this project. It${(confirm.project._count?.jobs ?? 0) ? ` and its ${plural(confirm.project._count!.jobs, "job")}` : ""} will be removed permanently.`
            : confirm && isInactive(confirm.project.status)
              ? "The project goes back to Started and reappears in pickers."
              : "Inactive projects disappear from timesheet and claim pickers. All logged time, jobs and the team are kept."
        }
        onConfirm={() => {
          if (!confirm) return;
          const p = confirm.project;
          const done = (t: string) => () => (toast.success(t, p.name), setConfirm(null));
          const fail = (e: unknown) => toast.error("Couldn’t update the project", e instanceof ApiError ? e.message : undefined);
          if (confirm.kind === "delete") m.deleteProject.mutate(p.id, { onSuccess: done("Project deleted"), onError: fail });
          else m.saveProject.mutate({ id: p.id, body: projectBody(p, { status: isInactive(p.status) ? "Started" : "Inactive" }) }, { onSuccess: done(isInactive(p.status) ? "Project reactivated" : "Project marked inactive"), onError: fail });
        }}
      />
    </div>
  );
}
