"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, DoorOpen, Plus, XCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { normRole } from "@/lib/roles";
import { today } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { FormRow, Input, Select, Textarea } from "@/components/ui/inputs";
import { StatCard } from "@/components/ui/stat";
import { useToast } from "@/components/ui/toast";
import { fullName, usePeople } from "@/components/management/api";
import { EXIT_STATUS_LABEL, EXIT_TYPES, exitTone, TEAM_LABEL, useExitMutations, useExits, type ExitRecord } from "@/components/hr/api";

type Tab = "active" | "INITIATED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "all";
const ACTIVE = ["INITIATED", "IN_PROGRESS"];

export default function ExitsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const hr = ["admin", "owner", "hr"].includes(normRole(user?.role));
  const q = useExits();
  const [tab, setTab] = useState<Tab>("active");
  const [search, setSearch] = useState("");
  const [starting, setStarting] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const all = useMemo(() => q.data ?? [], [q.data]);
  const rows = all.filter((x) => {
    if (tab === "active" && !ACTIVE.includes(x.status)) return false;
    if (tab !== "active" && tab !== "all" && x.status !== tab) return false;
    const s = search.trim().toLowerCase();
    return !s || `${x.employee.name} ${x.employee.code} ${x.employee.department} ${x.exitType}`.toLowerCase().includes(s);
  });
  const count = (st: string) => all.filter((x) => x.status === st).length;
  const open = all.find((x) => x.id === openId) ?? null;
  const soon = all.filter((x) => ACTIVE.includes(x.status) && x.daysToLastDay >= 0 && x.daysToLastDay <= 7).length;

  const columns: Column<ExitRecord>[] = [
    {
      key: "name",
      header: "Employee",
      sortValue: (x) => x.employee.name ?? "",
      cell: (x) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{x.employee.name}</p>
          <p className="truncate text-xs text-ink-subtle">
            {x.employee.code} · {x.employee.designation ?? "—"}
          </p>
        </div>
      ),
    },
    { key: "type", header: "Type", sortValue: (x) => x.exitType, cell: (x) => <span className="text-ink-muted">{x.exitType}</span>, hideBelow: "md" },
    {
      key: "lwd",
      header: "Last working day",
      sortValue: (x) => x.lastWorkingDay,
      exportValue: (x) => x.lastWorkingDay.slice(0, 10),
      cell: (x) => (
        <span>
          {formatDate(x.lastWorkingDay)}
          {ACTIVE.includes(x.status) && (
            <span className={cn("block text-xs", x.daysToLastDay < 0 ? "text-danger" : x.daysToLastDay <= 7 ? "text-warning" : "text-ink-subtle")}>
              {x.daysToLastDay < 0 ? `${-x.daysToLastDay} days ago` : x.daysToLastDay === 0 ? "Today" : `in ${x.daysToLastDay} days`}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "progress",
      header: "Checklist",
      sortValue: (x) => x.progress.done / Math.max(1, x.progress.total),
      exportValue: (x) => `${x.progress.done}/${x.progress.total}`,
      cell: (x) => (
        <div className="w-32">
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
            <div className="h-full rounded-full bg-brand" style={{ width: `${(x.progress.done / Math.max(1, x.progress.total)) * 100}%` }} />
          </div>
          <span className="text-xs text-ink-subtle tabular">
            {x.progress.done} of {x.progress.total} done
          </span>
        </div>
      ),
    },
    {
      key: "blockers",
      header: "Pending",
      hideBelow: "lg",
      exportValue: (x) => x.blockers.join("; "),
      cell: (x) =>
        x.blockers.length && ACTIVE.includes(x.status) ? (
          <span className="inline-flex items-center gap-1 text-xs text-warning">
            <AlertTriangle className="h-3.5 w-3.5" /> {x.blockers[0]}
            {x.blockers.length > 1 ? ` +${x.blockers.length - 1}` : ""}
          </span>
        ) : (
          <span className="text-xs text-ink-subtle">—</span>
        ),
    },
    { key: "status", header: "Status", sortValue: (x) => x.status, exportValue: (x) => EXIT_STATUS_LABEL[x.status], cell: (x) => <Badge tone={exitTone(x.status)}>{EXIT_STATUS_LABEL[x.status]}</Badge> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exits"
        description="Resignations and other exits, with the hand-over checklist for HR, IT, Accounts and the reporting manager."
        actions={
          <Button onClick={() => setStarting(true)}>
            <Plus className="h-4 w-4" /> {hr ? "Start exit" : "Submit resignation"}
          </Button>
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="Summary">
        <StatCard label="In progress" icon={DoorOpen} tone="brand" loading={q.isLoading} value={all.filter((x) => ACTIVE.includes(x.status)).length} />
        <StatCard label="Leaving within 7 days" icon={AlertTriangle} tone={soon ? "warning" : "neutral"} loading={q.isLoading} value={soon} />
        <StatCard label="Completed" icon={CheckCircle2} tone="success" loading={q.isLoading} value={count("COMPLETED")} />
        <StatCard label="Cancelled" icon={XCircle} loading={q.isLoading} value={count("CANCELLED")} />
      </section>

      <DataTable
        exportName="exits"
        itemsLabel="exits"
        rows={rows}
        columns={columns}
        rowKey={(x) => x.id}
        rowLabel={(x) => `Open exit of ${x.employee.name}`}
        loading={q.isLoading}
        error={q.isError}
        onRetry={() => q.refetch()}
        onRowClick={(x) => setOpenId(x.id)}
        initialSort={{ key: "lwd", dir: "asc" }}
        filterTabs={[
          { key: "active", label: "Active", count: all.filter((x) => ACTIVE.includes(x.status)).length },
          { key: "INITIATED", label: "Started", count: count("INITIATED") },
          { key: "IN_PROGRESS", label: "In progress", count: count("IN_PROGRESS") },
          { key: "COMPLETED", label: "Completed", count: count("COMPLETED") },
          { key: "CANCELLED", label: "Cancelled", count: count("CANCELLED") },
          { key: "all", label: "All", count: all.length },
        ]}
        activeFilterTab={tab}
        onFilterTabChange={(k) => setTab(k as Tab)}
        searchable
        searchPlaceholder="Search name, code, department…"
        searchValue={search}
        onSearchChange={setSearch}
        empty={{ icon: DoorOpen, title: search ? "No exits match your search" : tab === "active" ? "No exits in progress" : "No exits here" }}
      />

      {starting && <StartExitDialog hr={hr} selfId={user?.id} onClose={() => setStarting(false)} onStarted={(id) => (setStarting(false), setOpenId(id), toast.success("Exit started", "The checklist has been sent to HR, IT, Accounts and the manager."))} />}
      {open && <ExitDrawer exit={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function StartExitDialog({ hr, selfId, onClose, onStarted }: { hr: boolean; selfId?: string; onClose: () => void; onStarted: (id: string) => void }) {
  const toast = useToast();
  const m = useExitMutations();
  const people = usePeople(hr);
  const [f, setF] = useState({ employeeId: hr ? "" : (selfId ?? ""), exitType: "Resignation", resignationDate: today(), lastWorkingDay: "", reason: "" });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const active = (people.data ?? []).filter((p) => (p.status ?? "").toLowerCase() === "active").sort((a, b) => fullName(a).localeCompare(fullName(b)));

  async function submit() {
    try {
      const rec = await m.start.mutateAsync({
        ...(hr ? { employeeId: f.employeeId } : {}),
        exitType: hr ? f.exitType : "Resignation",
        resignationDate: f.resignationDate,
        lastWorkingDay: f.lastWorkingDay,
        reason: f.reason.trim() || undefined,
      });
      if (rec) onStarted(rec.id);
    } catch (e) {
      toast.error("Couldn’t start the exit", e instanceof ApiError ? e.message : undefined);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={hr ? "Start an exit" : "Submit your resignation"}
      description={hr ? "Creates the hand-over checklist and tells HR, IT, Accounts and the reporting manager." : "Your manager and HR are notified and the hand-over checklist starts."}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={m.start.isPending} disabled={(hr && !f.employeeId) || !f.lastWorkingDay || !f.resignationDate}>
            {hr ? "Start exit" : "Submit"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {hr && (
          <FormRow label="Employee" htmlFor="ex-emp" required className="sm:col-span-2">
            <Select id="ex-emp" value={f.employeeId} onChange={(e) => set("employeeId", e.target.value)}>
              <option value="">{people.isLoading ? "Loading…" : "Choose a person"}</option>
              {active.map((p) => (
                <option key={p.id} value={p.id}>
                  {fullName(p)} · {p.employeeId}
                </option>
              ))}
            </Select>
          </FormRow>
        )}
        {hr && (
          <FormRow label="Type of exit" htmlFor="ex-type">
            <Select id="ex-type" value={f.exitType} onChange={(e) => set("exitType", e.target.value)}>
              {EXIT_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </FormRow>
        )}
        <FormRow label={hr ? "Resignation / notice date" : "Date of resignation"} htmlFor="ex-res" required>
          <Input id="ex-res" type="date" value={f.resignationDate} onChange={(e) => set("resignationDate", e.target.value)} />
        </FormRow>
        <FormRow label="Last working day" htmlFor="ex-lwd" required>
          <Input id="ex-lwd" type="date" min={f.resignationDate} value={f.lastWorkingDay} onChange={(e) => set("lastWorkingDay", e.target.value)} />
        </FormRow>
        <FormRow label="Reason" htmlFor="ex-reason" className="sm:col-span-2">
          <Textarea id="ex-reason" rows={2} value={f.reason} onChange={(e) => set("reason", e.target.value)} maxLength={500} />
        </FormRow>
      </div>
    </Dialog>
  );
}

function ExitDrawer({ exit: x, onClose }: { exit: ExitRecord; onClose: () => void }) {
  const toast = useToast();
  const m = useExitMutations();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [pendingTask, setPendingTask] = useState<string | null>(null);
  const active = ACTIVE.includes(x.status);
  const teams = [...new Set(x.tasks.map((t) => t.team))];
  const err = (title: string) => (e: unknown) => toast.error(title, e instanceof ApiError ? e.message : undefined);

  const tick = (taskId: string, done: boolean) => {
    setPendingTask(taskId);
    m.tick.mutate({ id: x.id, taskId, body: { done } }, { onError: err("Couldn’t update the task"), onSettled: () => setPendingTask(null) });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={`${x.employee.name} · ${x.exitType}`}
      description={`${x.employee.code} · ${x.employee.designation ?? ""} · last working day ${formatDate(x.lastWorkingDay)}`}
      footer={
        active ? (
          <>
            {x.can.cancel && (
              <Button variant="ghost" onClick={() => setCancelling(true)}>
                Cancel exit
              </Button>
            )}
            {x.can.complete && (
              <Button
                onClick={() => m.complete.mutate(x.id, { onSuccess: () => toast.success("Exit completed", `${x.employee.name}’s portal access has been switched off.`), onError: err("Can’t complete yet") })}
                loading={m.complete.isPending}
                disabled={x.blockers.length > 0}
                title={x.blockers.length ? x.blockers.join(" · ") : undefined}
              >
                <CheckCircle2 className="h-4 w-4" /> Complete exit
              </Button>
            )}
          </>
        ) : (
          <Button onClick={onClose}>Close</Button>
        )
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={exitTone(x.status)}>{EXIT_STATUS_LABEL[x.status]}</Badge>
          <span className="text-xs text-ink-subtle tabular">
            {x.progress.done} of {x.progress.total} tasks done
          </span>
          {x.reason && <span className="text-xs text-ink-muted">· {x.reason}</span>}
        </div>

        {active && x.blockers.length > 0 && (
          <div className="rounded-xl border border-warning/40 bg-warning-soft/50 p-3 text-sm">
            <p className="mb-1 flex items-center gap-2 font-semibold text-ink">
              <AlertTriangle className="h-4 w-4 text-warning" /> Before the exit can be completed
            </p>
            <ul className="list-disc space-y-0.5 pl-6 text-ink-muted">
              {x.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            {x.checks.assets.items.length > 0 && <p className="mt-2 text-xs text-ink-subtle">Assets held: {x.checks.assets.items.join(", ")}</p>}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {teams.map((team) => (
            <section key={team} className="rounded-xl border border-line p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{TEAM_LABEL[team] ?? team}</p>
              <ul className="space-y-2">
                {x.tasks
                  .filter((t) => t.team === team)
                  .map((t) => (
                    <li key={t.id}>
                      <label className={cn("flex items-start gap-2 text-sm", t.canTick && active ? "cursor-pointer" : "cursor-default")}>
                        <input
                          type="checkbox"
                          checked={t.done}
                          disabled={!t.canTick || !active || pendingTask === t.id}
                          onChange={(e) => tick(t.id, e.target.checked)}
                          className="mt-0.5 h-4 w-4 accent-[#003887]"
                        />
                        <span>
                          <span className={cn(t.done ? "text-ink-muted line-through" : "text-ink")}>{t.title}</span>
                          {t.done && t.doneBy && (
                            <span className="block text-[11px] text-ink-subtle">
                              {t.doneBy}
                              {t.doneAt ? ` · ${formatDate(t.doneAt)}` : ""}
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>

        {cancelling && (
          <div className="space-y-2 rounded-xl border border-line p-3">
            <FormRow label="Why is this exit being cancelled?" htmlFor="ex-cancel" required>
              <Textarea id="ex-cancel" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
            </FormRow>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setCancelling(false)}>
                Keep exit
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={!reason.trim()}
                loading={m.cancel.isPending}
                onClick={() => m.cancel.mutate({ id: x.id, reason: reason.trim() }, { onSuccess: () => (toast.success("Exit cancelled"), setCancelling(false)), onError: err("Couldn’t cancel") })}
              >
                Cancel exit
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
