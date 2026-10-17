"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bug as BugIcon, Download, Kanban, Plus, SlidersHorizontal, Table2, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { ApiError, api, downloadFile } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, formatNumber, formatTime } from "@/lib/format";
import { today } from "@/lib/dates";
import { roleLabel } from "@/lib/roles";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/inputs";
import { ConfirmDialog } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { DataTable, type Column } from "@/components/ui/data-table";
import { BUG_STATUSES, isOpenish, isTriage, useBugAssignees, useBugMutations, useBugs, type Bug, type BugQuery } from "@/components/bugs/api";
import { Chip, CopyCode, EnvChip, ExtRefChip, InlineSelect, PersonChip, PriorityChip, StatusBadge, TypeChip } from "@/components/bugs/chips";
import { BugBoard } from "@/components/bugs/board";
import { activeFilterCount, FiltersDialog, NO_FILTERS, type BugFilters } from "@/components/bugs/filters-dialog";
import { useBugActions } from "@/components/bugs/use-status-change";
import { useNewBug } from "@/components/bugs/new-bug-dialog";

/** Filter pills → API query. */
const VIEWS: { key: string; label: string; query: BugQuery }[] = [
  { key: "unassigned", label: "Unassigned", query: { assignee: "none", open: "1" } },
  { key: "pending", label: "Pending discussion", query: { status: "Pending Discussion" } },
  { key: "all", label: "All tickets", query: {} },
  { key: "open", label: "Open", query: { status: "Open" } },
  { key: "progress", label: "In progress", query: { status: "In Progress" } },
  { key: "ready", label: "Ready to test", query: { status: "Ready to Test" } },
  { key: "resolved", label: "Resolved", query: { status: "Resolved" } },
  { key: "reopened", label: "Reopened", query: { status: "Reopened" } },
  { key: "notabug", label: "Not a bug", query: { status: "Not a Bug" } },
  { key: "pastdue", label: "Past due", query: { pastDue: "1" } },
  { key: "mine", label: "Mine", query: { assignee: "me", open: "1" } },
];
const SEARCH_FIELDS = [
  { value: "all", label: "Everything" },
  { value: "id", label: "ID" },
  { value: "subject", label: "Subject" },
  { value: "description", label: "Description" },
  { value: "reporter", label: "Reporter" },
];

export default function BugListPage() {
  return (
    <Suspense>
      <BugList />
    </Suspense>
  );
}

function BugList() {
  const { user } = useAuth();
  const triage = isTriage(user?.role);
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const toast = useToast();
  const qc = useQueryClient();
  const openNew = useNewBug();
  const { remove } = useBugMutations();
  const actions = useBugActions();
  const assignees = useBugAssignees();

  const view = VIEWS.some((v) => v.key === sp.get("view")) ? sp.get("view")! : "all";
  const mode = sp.get("mode") === "board" ? "board" : "table";
  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  const [field, setField] = useState("all");
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTerm(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  const [filters, setFilters] = useState<BugFilters>(NO_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toDelete, setToDelete] = useState<Bug | null>(null);
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  const base: BugQuery = useMemo(
    () => ({
      type: filters.type || undefined,
      priority: filters.priority || undefined,
      module: filters.module || undefined,
      environment: filters.environment || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      q: term || undefined,
      field: term ? field : undefined,
    }),
    [filters, term, field],
  );
  const viewQuery = VIEWS.find((v) => v.key === view)!.query;
  const query: BugQuery = { ...base, ...(filters.assignee ? { assignee: filters.assignee } : {}), ...viewQuery };
  const q = useBugs(query);
  const rows = useMemo(() => q.data?.data ?? [], [q.data]);
  const counts = q.data?.counts;
  const people = assignees.data ?? [];

  const countFor = (key: string): number | undefined => {
    if (!counts) return undefined;
    if (key === "all") return counts.all;
    if (key === "unassigned") return counts.unassigned;
    if (key === "pastdue") return counts.pastDue;
    if (key === "mine") return counts.mine;
    const st = VIEWS.find((v) => v.key === key)?.query.status;
    return st ? (counts.byStatus[st] ?? 0) : undefined;
  };

  const summary = {
    open: rows.filter((r) => isOpenish(r.status)).length,
    critical: rows.filter((r) => r.priority === "Critical" && isOpenish(r.status)).length,
    unassigned: rows.filter((r) => !r.assigneeId && isOpenish(r.status)).length,
    pastDue: rows.filter((r) => r.isPastDue).length,
  };

  const exportXlsx = () =>
    downloadFile("bugs/export", `bugs-${today()}.xlsx`, query).catch((e) => toast.error("Couldn’t export", e instanceof ApiError ? e.message : undefined));

  async function applyBulk() {
    const ids = [...selected];
    const body: Record<string, unknown> = {};
    if (bulkStatus) body.status = bulkStatus;
    if (bulkAssignee) body.assigneeId = bulkAssignee === "none" ? null : bulkAssignee;
    if (!ids.length || !Object.keys(body).length) return;
    setBulkBusy(true);
    const results = await Promise.allSettled(ids.map((id) => api(`bugs/${id}`, { method: "PATCH", body })));
    setBulkBusy(false);
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    void qc.invalidateQueries({ queryKey: ["bugs"] });
    if (failed.length) toast.error(`${failed.length} of ${ids.length} tickets weren’t updated`, failed[0].reason instanceof ApiError ? failed[0].reason.message : undefined);
    else toast.success(`${ids.length} ticket${ids.length === 1 ? "" : "s"} updated`);
    setSelected(new Set());
    setBulkStatus("");
    setBulkAssignee("");
  }

  const columns: Column<Bug>[] = [
    {
      key: "subject",
      header: "Subject",
      sortValue: (b) => b.code,
      cell: (b) => (
        <div className="min-w-0 max-w-[460px]">
          <CopyCode code={b.code} />
          <p className="mt-0.5 line-clamp-2 font-medium text-ink">{b.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <PriorityChip priority={b.priority} />
            <TypeChip type={b.type} />
            {b.module && <Chip>{b.module}</Chip>}
            <EnvChip env={b.environment} />
            {b.externalRef && <ExtRefChip value={b.externalRef} />}
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (b) => BUG_STATUSES.indexOf(b.status as (typeof BUG_STATUSES)[number]),
      cell: (b) =>
        b.allowedStatuses.length ? (
          <InlineSelect className="w-44" label={`Status of ${b.code}`} value={b.status} onChange={(v) => actions.setStatus(b, v)}>
            {[...new Set([b.status, ...b.allowedStatuses])].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </InlineSelect>
        ) : (
          <StatusBadge status={b.status} />
        ),
    },
    {
      key: "due",
      header: "Due",
      hideBelow: "md",
      sortValue: (b) => b.dueDate ?? "9999",
      cell: (b) =>
        b.dueDate ? (
          <span className={cn("whitespace-nowrap text-[13px]", b.isPastDue ? "font-semibold text-danger" : "text-ink-muted")}>
            {formatDate(b.dueDate)}
            <span className="block text-[11px]">{b.isPastDue ? "Past due" : formatTime(b.dueDate)}</span>
          </span>
        ) : (
          <span className="text-ink-subtle">—</span>
        ),
    },
    {
      key: "assignee",
      header: "Assignee",
      sortValue: (b) => b.assignee?.name ?? "",
      cell: (b) =>
        triage ? (
          <InlineSelect
            className="w-48"
            label={`Assignee of ${b.code}`}
            value={b.assigneeId ?? ""}
            onChange={(v) => actions.setAssignee(b, v || null, people.find((p) => p.id === v)?.name)}
          >
            <option value="">Unassigned</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </InlineSelect>
        ) : (
          <PersonChip person={b.assignee} sub={null} />
        ),
    },
    {
      key: "reporter",
      header: "Created by",
      hideBelow: "lg",
      sortValue: (b) => b.createdAt,
      cell: (b) => (
        <span className="block whitespace-nowrap">
          <span className="block text-sm font-medium text-ink">{b.reporter?.name ?? "—"}</span>
          <span className="block text-[11px] text-ink-subtle">
            {b.reporter ? roleLabel(b.reporter.role) : ""} · {formatDate(b.createdAt)}
          </span>
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      cell: (b) =>
        b.canDelete ? (
          <button
            type="button"
            onClick={(e) => (e.stopPropagation(), setToDelete(b))}
            aria-label={`Delete ${b.code}`}
            title="Delete ticket"
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-subtle hover:bg-danger-soft hover:text-danger"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null,
    },
  ];

  const nFilters = activeFilterCount(filters);
  const fieldPicker = (
    <div className="flex items-center gap-1.5">
      <span className="hidden text-xs text-ink-muted md:inline">
        Search by
      </span>
      <div className="w-32">
        <Select aria-label="Search by" value={field} onChange={(e) => setField(e.target.value)} className="[&_button[role=combobox]]:h-9 [&_button[role=combobox]]:rounded-lg [&_button[role=combobox]]:text-xs">
          {SEARCH_FIELDS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
  const toolbar = (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
      {fieldPicker}
      <div className="inline-flex rounded-lg border border-line p-0.5" role="group" aria-label="View">
        {(
          [
            ["table", "Table", Table2],
            ["board", "Board", Kanban],
          ] as const
        ).map(([m, label, Icon]) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setParam("mode", m === "board" ? "board" : null)}
            className={cn("inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium", mode === m ? "bg-brand text-brand-ink" : "text-ink-muted hover:bg-surface-muted")}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
          </button>
        ))}
      </div>
      <Button variant="secondary" size="sm" onClick={() => setShowFilters(true)} className="h-9">
        <SlidersHorizontal className="h-4 w-4" /> Filters
        {nFilters > 0 && <span className="rounded-full bg-brand px-1.5 text-[11px] font-semibold text-brand-ink">{nFilters}</span>}
      </Button>
      {nFilters > 0 && (
        <button type="button" onClick={() => setFilters(NO_FILTERS)} className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink">
          <X className="h-3.5 w-3.5" aria-hidden /> Clear
        </button>
      )}
      <Button variant="secondary" size="sm" className="h-9" onClick={exportXlsx} disabled={!rows.length}>
        <Download className="h-4 w-4" /> Export
      </Button>
    </div>
  );

  return (
    <div className="space-y-3">
      {triage && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 bg-brand-softer px-4 py-2.5" role="region" aria-label="Bulk update">
          <span className="text-sm font-semibold text-ink">{selected.size} selected</span>
          <div className="w-48">
            <Select aria-label="New status" value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} className="[&_button[role=combobox]]:h-9 [&_button[role=combobox]]:text-xs">
              <option value="">Status: no change</option>
              {BUG_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </div>
          <div className="w-52">
            <Select aria-label="New assignee" value={bulkAssignee} onChange={(e) => setBulkAssignee(e.target.value)} className="[&_button[role=combobox]]:h-9 [&_button[role=combobox]]:text-xs">
              <option value="">Assignee: no change</option>
              <option value="none">Unassigned</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <Button size="sm" onClick={applyBulk} loading={bulkBusy} disabled={!bulkStatus && !bulkAssignee}>
            Apply
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear selection
          </Button>
        </div>
      )}

      {mode === "table" ? (
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(b) => b.id}
          loading={q.isLoading}
          error={q.isError}
          onRetry={() => q.refetch()}
          filterTabs={VIEWS.map((v) => ({ key: v.key, label: v.label, count: countFor(v.key) }))}
          activeFilterTab={view}
          onFilterTabChange={(k) => (setSelected(new Set()), setParam("view", k === "all" ? null : k))}
          searchable
          searchPlaceholder={`Search ${SEARCH_FIELDS.find((f) => f.value === field)?.label.toLowerCase() ?? ""}…`}
          searchValue={search}
          onSearchChange={setSearch}
          toolbarActions={toolbar}
          selectable={triage}
          selectedKeys={selected}
          onSelectionChange={setSelected}
          itemsLabel="tickets"
          exportName={false}
          onRowClick={(b) => router.push(`/bugs/${b.id}`)}
          rowLabel={(b) => `Open ${b.code}: ${b.title}`}
          pageSize={25}
          empty={{
            icon: BugIcon,
            title: term || nFilters ? "No tickets match these filters" : view === "all" ? "No tickets yet" : "Nothing in this view",
            description: view === "all" && !term && !nFilters ? "Found something that doesn’t work? Report it and the IT team will pick it up." : undefined,
            action:
              view === "all" && !term && !nFilters ? (
                <Button size="sm" onClick={() => openNew()}>
                  <Plus className="h-4 w-4" /> New ticket
                </Button>
              ) : undefined,
          }}
        />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              aria-label="Search tickets"
              className="h-9 w-full max-w-xs rounded-lg border border-line bg-surface px-3 text-xs text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <div className="ml-auto flex flex-wrap items-center gap-2">{toolbar}</div>
          </div>
          {q.isError ? (
            <div className="rounded-xl border border-line bg-surface p-6 text-center text-sm">
              <p className="font-semibold text-danger">Couldn’t load tickets</p>
              <button onClick={() => q.refetch()} className="mt-2 text-[13px] font-semibold text-brand hover:underline">
                Retry
              </button>
            </div>
          ) : (
            <BugBoard rows={rows} loading={q.isLoading} onMove={actions.setStatus} />
          )}
          <p className="text-xs text-ink-subtle">Drag a card to another column to change its status — only the moves you’re allowed to make are highlighted.</p>
        </div>
      )}

      {!q.isLoading && !q.isError && (
        <p className="text-xs text-ink-muted tabular" aria-live="polite">
          {formatNumber(rows.length)} {rows.length === 1 ? "ticket" : "tickets"} · {formatNumber(summary.open)} open · {formatNumber(summary.critical)} critical · {formatNumber(summary.unassigned)} unassigned ·{" "}
          <span className={summary.pastDue ? "font-semibold text-danger" : undefined}>{formatNumber(summary.pastDue)} past due</span>
        </p>
      )}

      <FiltersDialog open={showFilters} value={filters} people={people} onClose={() => setShowFilters(false)} onApply={(f) => (setFilters(f), setSelected(new Set()))} />
      {actions.dialog}
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        tone="danger"
        title={toDelete ? `Delete ${toDelete.code}?` : "Delete"}
        confirmLabel="Delete ticket"
        busy={remove.isPending}
        description="The ticket, its comments and attachments will be removed permanently."
        onConfirm={() =>
          toDelete &&
          remove.mutate(toDelete.id, {
            onSuccess: () => (toast.success("Ticket deleted", toDelete.code), setToDelete(null)),
            onError: (e) => toast.error("Couldn’t delete", e instanceof ApiError ? e.message : undefined),
          })
        }
      />
    </div>
  );
}
