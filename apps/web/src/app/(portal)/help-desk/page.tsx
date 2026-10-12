"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock4, Download, Headset, Inbox, Plus, Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { today } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import { timeAgo } from "@/lib/notifications";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/inputs";
import { Segmented } from "@/components/ui/segmented";
import { DataTable, type Column } from "@/components/ui/data-table";
import { downloadCsv } from "@/components/claims/claim-tabs";
import {
  categoryLabel,
  isSupportAgent,
  PRIORITY_TONE,
  raiserName,
  seesTeamTickets,
  slaState,
  STATUS_TONE,
  statusKey,
  ticketCode,
  useTickets,
  type StatusKey,
  type Ticket,
} from "@/components/helpdesk/api";
import { RaiseTicketDialog } from "@/components/helpdesk/raise-dialog";

type Tab = "active" | StatusKey | "all";
const ACTIVE: StatusKey[] = ["open", "progress", "returned"];

export default function HelpDeskPage() {
  const { user } = useAuth();
  const router = useRouter();
  const agent = isSupportAgent(user?.role);
  const team = seesTeamTickets(user?.role);
  const q = useTickets();
  const [tab, setTab] = useState<Tab>("active");
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState("");
  const [assignee, setAssignee] = useState("");
  const [raise, setRaise] = useState(false);

  const all = useMemo(() => q.data ?? [], [q.data]);
  const assignees = useMemo(() => [...new Set(all.map((t) => t.assigneeName).filter(Boolean) as string[])].sort(), [all]);
  const rows = all.filter((t) => {
    const s = statusKey(t.status);
    if (tab === "active" && !ACTIVE.includes(s)) return false;
    if (tab !== "active" && tab !== "all" && s !== tab) return false;
    if (priority && t.priority !== priority) return false;
    if (assignee === "__none" && t.assignedTo) return false;
    if (assignee === "__me" && t.assignedTo !== user?.id) return false;
    if (assignee && !assignee.startsWith("__") && t.assigneeName !== assignee) return false;
    const x = search.trim().toLowerCase();
    return !x || `${ticketCode(t)} ${t.title} ${t.description} ${raiserName(t)} ${categoryLabel(t)} ${t.assigneeName ?? ""}`.toLowerCase().includes(x);
  });

  const count = (k: StatusKey) => all.filter((t) => statusKey(t.status) === k).length;
  const overdue = all.filter((t) => slaState(t).overdue).length;

  const columns: Column<Ticket>[] = [
    {
      key: "title",
      header: "Ticket",
      sortValue: (t) => t.createdAt,
      cell: (t) => {
        const sla = slaState(t);
        return (
          <div className="min-w-0 max-w-[420px]">
            <p className="flex items-center gap-2">
              <span className="text-xs font-semibold text-brand">{ticketCode(t)}</span>
              {sla.overdue && <Badge tone="danger">Overdue</Badge>}
            </p>
            <p className="truncate font-medium text-ink">{t.title}</p>
            <p className="truncate text-xs text-ink-subtle">{categoryLabel(t)}</p>
          </div>
        );
      },
    },
    { key: "priority", header: "Priority", hideBelow: "sm", sortValue: (t) => ["High", "Medium", "Low"].indexOf(t.priority ?? "Low"), cell: (t) => <Badge tone={PRIORITY_TONE[t.priority ?? "Low"] ?? "neutral"}>{t.priority ?? "Low"}</Badge> },
    { key: "status", header: "Status", sortValue: (t) => t.status, cell: (t) => <Badge tone={STATUS_TONE[statusKey(t.status)]}>{t.status}</Badge> },
    ...(agent || team ? [{ key: "raiser", header: "Raised by", hideBelow: "md" as const, sortValue: (t: Ticket) => raiserName(t), cell: (t: Ticket) => <span className="text-ink-muted">{raiserName(t)}</span> }] : []),
    { key: "assignee", header: "Assigned to", hideBelow: "lg", sortValue: (t) => t.assigneeName ?? "", cell: (t) => <span className={t.assigneeName ? "text-ink" : "italic text-ink-subtle"}>{t.assigneeName ?? "Unassigned"}</span> },
    { key: "age", header: "Raised", align: "right", hideBelow: "sm", sortValue: (t) => t.createdAt, cell: (t) => <span className="whitespace-nowrap text-ink-muted">{timeAgo(t.createdAt)}</span> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={agent ? "Help desk" : team ? "Team support tickets" : "My support tickets"}
        description={agent ? "Every ticket raised to support teams." : "Raise an issue with IT, HR, Finance or Admin and follow it to resolution."}
        actions={
          <>
            <Button
              variant="secondary"
              disabled={!rows.length}
              onClick={() =>
                downloadCsv(
                  `tickets-${today()}.csv`,
                  ["Ticket", "Subject", "Category", "Priority", "Status", "Raised by", "Department", "Assigned to", "Raised on", "Response due", "Overdue"],
                  rows.map((t) => {
                    const s = slaState(t);
                    return [ticketCode(t), t.title, categoryLabel(t), t.priority, t.status, raiserName(t), t.createdBy?.department, t.assigneeName ?? "", t.createdAt.slice(0, 10), s.due.toISOString().slice(0, 16).replace("T", " "), s.overdue ? "Yes" : "No"];
                  }),
                )
              }
            >
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button onClick={() => setRaise(true)}>
              <Plus className="h-4 w-4" /> Raise ticket
            </Button>
          </>
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="Summary">
        <StatCard label="Open" icon={Inbox} tone="brand" loading={q.isLoading} value={formatNumber(count("open"))} hint={agent ? `${formatNumber(all.filter((t) => statusKey(t.status) === "open" && !t.assignedTo).length)} unassigned` : undefined} />
        <StatCard label="In progress" icon={Clock4} loading={q.isLoading} value={formatNumber(count("progress"))} />
        <StatCard label="Past response target" icon={AlertTriangle} loading={q.isLoading} value={formatNumber(overdue)} tone={overdue ? "danger" : "neutral"} />
        <StatCard label="Resolved" icon={CheckCircle2} loading={q.isLoading} value={formatNumber(count("resolved"))} tone="success" />
      </section>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Segmented
          aria-label="Status"
          value={tab}
          onChange={setTab}
          options={[
            { value: "active", label: "Active", count: all.filter((t) => ACTIVE.includes(statusKey(t.status))).length || undefined },
            { value: "open", label: "Open" },
            { value: "progress", label: "In progress" },
            { value: "returned", label: "Returned" },
            { value: "resolved", label: "Resolved" },
            { value: "all", label: "All" },
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select aria-label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)} className="sm:w-36">
            <option value="">Any priority</option>
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </Select>
          {agent && (
            <Select aria-label="Assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)} className="sm:w-48">
              <option value="">Anyone</option>
              <option value="__me">Assigned to me</option>
              <option value="__none">Unassigned</option>
              {assignees.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </Select>
          )}
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
            <Input placeholder="Search tickets" aria-label="Search tickets" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(t) => t.id}
        loading={q.isLoading}
        error={q.isError}
        onRetry={() => q.refetch()}
        onRowClick={(t) => router.push(`/help-desk/${t.id}`)}
        initialSort={{ key: "title", dir: "desc" }}
        pageSize={20}
        empty={{
          icon: Headset,
          title: search || priority || assignee ? "No tickets match these filters" : tab === "active" ? "No active tickets" : "No tickets here",
          description: !agent && tab === "active" ? "Need help with something? Raise a ticket and the right team will pick it up." : undefined,
          action: !search ? (
            <Button size="sm" onClick={() => setRaise(true)}>
              <Plus className="h-4 w-4" /> Raise ticket
            </Button>
          ) : undefined,
        }}
      />

      <RaiseTicketDialog open={raise} onClose={() => setRaise(false)} />
    </div>
  );
}
