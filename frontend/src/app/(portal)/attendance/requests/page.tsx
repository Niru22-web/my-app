"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ClipboardCheck, Clock, Plus, Settings2, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import { useScopes } from "@/lib/scopes";
import { normRole } from "@/lib/roles";
import { addDays, fmtDay, today } from "@/lib/dates";
import type { Envelope } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { FormRow, Input, Textarea } from "@/components/ui/inputs";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";

interface CorrectionRequest {
  id: string;
  date: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  remarks: string | null;
  createdAt: string;
  decidedBy: string | null;
  employee: { id: string; code: string; name: string; designation: string | null } | null;
  current: { checkInTime: string | null; checkOutTime: string | null; totalHours: number; computedStatus: string; lateMinutes: number };
  canDecide: boolean;
  canCancel: boolean;
}
interface Policy {
  graceMinutes: number;
  fullDayMinHours: number;
  halfDayMinHours: number;
  regularizeWithinDays: number;
  regularizeMonthlyLimit: number;
}

const TONE: Record<string, "warning" | "success" | "danger" | "neutral"> = { PENDING: "warning", APPROVED: "success", REJECTED: "danger", CANCELLED: "neutral" };
const LABEL: Record<string, string> = { PENDING: "Waiting", APPROVED: "Approved", REJECTED: "Rejected", CANCELLED: "Withdrawn" };
type Scope = "my" | "team" | "org";

export default function AttendanceRequestsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const scopes = useScopes();
  const firm = ["admin", "owner", "hr"].includes(normRole(user?.role));
  const [scope, setScope] = useState<Scope>("my");
  const [tab, setTab] = useState("PENDING");
  const [search, setSearch] = useState("");
  const [raising, setRaising] = useState(false);
  const [deciding, setDeciding] = useState<{ r: CorrectionRequest; approve: boolean } | null>(null);
  const [rules, setRules] = useState(false);

  const q = useQuery({
    queryKey: ["attendance", "requests", scope],
    queryFn: async () => (await api<Envelope<CorrectionRequest[]>>("attendance/requests", { query: { scope } })).data ?? [],
  });
  const policy = useQuery({ queryKey: ["attendance", "policy"], queryFn: async () => (await api<Envelope<Policy>>("attendance/policy")).data, staleTime: 5 * 60_000 });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["attendance"] });
  };
  const cancel = useMutation({ mutationFn: (id: string) => api(`attendance/requests/${id}/cancel`, { method: "POST" }), onSuccess: refresh });

  const all = useMemo(() => q.data ?? [], [q.data]);
  const rows = all.filter((r) => (tab === "all" || r.status === tab) && (!search.trim() || `${r.employee?.name} ${r.employee?.code} ${r.reason}`.toLowerCase().includes(search.trim().toLowerCase())));
  const count = (s: string) => all.filter((r) => r.status === s).length;
  const scopeOptions = [
    { value: "my" as Scope, label: "My requests" },
    ...(scopes.data?.team ? [{ value: "team" as Scope, label: "Team" }] : []),
    ...(firm ? [{ value: "org" as Scope, label: "Organization" }] : []),
  ];

  const columns: Column<CorrectionRequest>[] = [
    ...(scope !== "my"
      ? [
          {
            key: "who",
            header: "Employee",
            sortValue: (r: CorrectionRequest) => r.employee?.name ?? "",
            cell: (r: CorrectionRequest) => (
              <div>
                <p className="font-medium text-ink">{r.employee?.name}</p>
                <p className="text-xs text-ink-subtle">{r.employee?.code}</p>
              </div>
            ),
          },
        ]
      : []),
    { key: "date", header: "Date", sortValue: (r) => r.date, cell: (r) => <span className="whitespace-nowrap">{fmtDay(r.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span> },
    {
      key: "asked",
      header: "Asked for",
      exportValue: (r) => `${r.checkInTime ?? "—"} – ${r.checkOutTime ?? "—"}`,
      cell: (r) => (
        <span className="tabular">
          {r.checkInTime ?? "—"} – {r.checkOutTime ?? "—"}
        </span>
      ),
    },
    {
      key: "recorded",
      header: "Recorded",
      hideBelow: "md",
      exportValue: (r) => `${r.current.checkInTime ?? "—"} – ${r.current.checkOutTime ?? "—"} (${r.current.computedStatus})`,
      cell: (r) => (
        <span className="text-xs text-ink-muted">
          <span className="tabular">
            {r.current.checkInTime ?? "—"} – {r.current.checkOutTime ?? "—"}
          </span>
          <span className="block">{r.current.computedStatus}</span>
        </span>
      ),
    },
    { key: "reason", header: "Reason", hideBelow: "lg", sortValue: (r) => r.reason, cell: (r) => <span className="line-clamp-2 text-xs text-ink-muted">{r.reason}</span> },
    {
      key: "status",
      header: "Status",
      sortValue: (r) => r.status,
      exportValue: (r) => LABEL[r.status],
      cell: (r) => (
        <span>
          <Badge tone={TONE[r.status]}>{LABEL[r.status]}</Badge>
          {r.decidedBy && <span className="mt-0.5 block text-[11px] text-ink-subtle">{r.decidedBy}</span>}
          {r.remarks && <span className="block max-w-[200px] truncate text-[11px] text-ink-subtle">“{r.remarks}”</span>}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (r) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {r.canDecide && (
            <>
              <button onClick={() => setDeciding({ r, approve: true })} className="grid h-8 w-8 place-items-center rounded-lg text-success hover:bg-success-soft" aria-label="Approve" title="Approve">
                <Check className="h-4 w-4" />
              </button>
              <button onClick={() => setDeciding({ r, approve: false })} className="grid h-8 w-8 place-items-center rounded-lg text-danger hover:bg-danger-soft" aria-label="Reject" title="Reject">
                <X className="h-4 w-4" />
              </button>
            </>
          )}
          {r.canCancel && (
            <Button size="sm" variant="ghost" onClick={() => cancel.mutate(r.id, { onSuccess: () => toast.success("Request withdrawn"), onError: (e) => toast.error("Couldn’t withdraw", e instanceof ApiError ? e.message : undefined) })}>
              Withdraw
            </Button>
          )}
        </div>
      ),
    },
  ];

  const p = policy.data;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance corrections"
        description={
          p
            ? `Forgot to punch in or out? Ask for a correction within ${p.regularizeWithinDays} days. Late after ${p.graceMinutes} minutes past shift start; under ${p.fullDayMinHours} h is a half day, under ${p.halfDayMinHours} h is absent.`
            : "Ask for a correction when you forgot to punch in or out."
        }
        actions={
          <>
            {firm && (
              <Button variant="secondary" onClick={() => setRules(true)}>
                <Settings2 className="h-4 w-4" /> Attendance rules
              </Button>
            )}
            <Button onClick={() => setRaising(true)}>
              <Plus className="h-4 w-4" /> Request a correction
            </Button>
          </>
        }
      />
      {scopeOptions.length > 1 && <Segmented aria-label="Whose requests" value={scope} onChange={(v) => (setScope(v), setTab("PENDING"))} options={scopeOptions} />}

      <DataTable
        exportName="attendance-corrections"
        itemsLabel="requests"
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        loading={q.isLoading}
        error={q.isError}
        onRetry={() => q.refetch()}
        initialSort={{ key: "date", dir: "desc" }}
        filterTabs={[
          { key: "PENDING", label: "Waiting", count: count("PENDING") },
          { key: "APPROVED", label: "Approved", count: count("APPROVED") },
          { key: "REJECTED", label: "Rejected", count: count("REJECTED") },
          { key: "CANCELLED", label: "Withdrawn", count: count("CANCELLED") },
          { key: "all", label: "All", count: all.length },
        ]}
        activeFilterTab={tab}
        onFilterTabChange={setTab}
        searchable={scope !== "my"}
        searchPlaceholder="Search name, code, reason…"
        searchValue={search}
        onSearchChange={setSearch}
        empty={{ icon: ClipboardCheck, title: tab === "PENDING" ? "Nothing waiting" : "No requests here" }}
      />

      {raising && <RaiseDialog windowDays={p?.regularizeWithinDays ?? 7} onClose={() => setRaising(false)} onDone={refresh} />}
      {deciding && <DecideDialog item={deciding.r} approve={deciding.approve} onClose={() => setDeciding(null)} onDone={refresh} />}
      {rules && p && <RulesDialog policy={p} onClose={() => setRules(false)} onDone={() => void qc.invalidateQueries({ queryKey: ["attendance"] })} />}
    </div>
  );
}

function RaiseDialog({ windowDays, onClose, onDone }: { windowDays: number; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ date: addDays(today(), -1), checkIn: "11:00", checkOut: "20:00", reason: "" });
  const m = useMutation({
    mutationFn: () => api("attendance/requests", { method: "POST", body: { date: f.date, checkIn: f.checkIn || undefined, checkOut: f.checkOut || undefined, reason: f.reason.trim() } }),
    onSuccess: () => (toast.success("Request sent", "Your manager has been notified."), onDone(), onClose()),
    onError: (e) => toast.error("Couldn’t send the request", e instanceof ApiError ? e.message : undefined),
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title="Request an attendance correction"
      description={`For a day in the last ${windowDays} days. Leave a time empty if only the other one is missing.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => m.mutate()} loading={m.isPending} disabled={!f.date || f.reason.trim().length < 3 || (!f.checkIn && !f.checkOut)}>
            Send request
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <FormRow label="Date" htmlFor="rq-date" required>
          <Input id="rq-date" type="date" value={f.date} min={addDays(today(), -windowDays)} max={today()} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </FormRow>
        <FormRow label="Check-in" htmlFor="rq-in">
          <Input id="rq-in" type="time" value={f.checkIn} onChange={(e) => setF({ ...f, checkIn: e.target.value })} />
        </FormRow>
        <FormRow label="Check-out" htmlFor="rq-out">
          <Input id="rq-out" type="time" value={f.checkOut} onChange={(e) => setF({ ...f, checkOut: e.target.value })} />
        </FormRow>
        <FormRow label="Reason" htmlFor="rq-reason" required className="sm:col-span-3">
          <Textarea id="rq-reason" rows={2} maxLength={500} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. Forgot to punch out — left at 8 pm after the client call" />
        </FormRow>
      </div>
    </Dialog>
  );
}

function DecideDialog({ item, approve, onClose, onDone }: { item: CorrectionRequest; approve: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [remarks, setRemarks] = useState("");
  const m = useMutation({
    mutationFn: () => api(`attendance/requests/${item.id}/${approve ? "approve" : "reject"}`, { method: "POST", body: { remarks: remarks.trim() || undefined } }),
    onSuccess: () => (toast.success(approve ? "Correction approved" : "Request rejected", `${item.employee?.name} has been notified.`), onDone(), onClose()),
    onError: (e) => toast.error("Couldn’t update", e instanceof ApiError ? e.message : undefined),
  });
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={approve ? "Approve this correction?" : "Reject this request?"}
      description={`${item.employee?.name} · ${fmtDay(item.date, { day: "numeric", month: "short" })} · ${item.checkInTime ?? "—"} – ${item.checkOutTime ?? "—"}. ${approve ? "Their attendance for that day is updated." : ""}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={approve ? "primary" : "danger"} onClick={() => m.mutate()} loading={m.isPending} disabled={!approve && !remarks.trim()}>
            {approve ? "Approve" : "Reject"}
          </Button>
        </>
      }
    >
      <p className="mb-3 rounded-lg bg-surface-muted px-3 py-2 text-xs text-ink-muted">
        <Clock className="mr-1 inline h-3.5 w-3.5" /> “{item.reason}”
      </p>
      <FormRow label={approve ? "Comment (optional)" : "Reason (they will see this)"} htmlFor="dec-remarks" required={!approve}>
        <Textarea id="dec-remarks" rows={2} maxLength={300} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      </FormRow>
    </Dialog>
  );
}

function RulesDialog({ policy, onClose, onDone }: { policy: Policy; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    graceMinutes: String(policy.graceMinutes),
    fullDayMinHours: String(policy.fullDayMinHours),
    halfDayMinHours: String(policy.halfDayMinHours),
    regularizeWithinDays: String(policy.regularizeWithinDays),
    regularizeMonthlyLimit: String(policy.regularizeMonthlyLimit),
  });
  const m = useMutation({
    mutationFn: () => api<{ message?: string }>("attendance/policy", { method: "PUT", body: f }),
    onSuccess: () => (toast.success("Attendance rules saved"), onDone(), onClose()),
    onError: (e) => toast.error("Couldn’t save", e instanceof ApiError ? e.message : undefined),
  });
  const field = (k: keyof typeof f, label: string, hint: string) => (
    <FormRow label={label} htmlFor={`pol-${k}`} hint={hint}>
      <Input id={`pol-${k}`} inputMode="decimal" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </FormRow>
  );
  return (
    <Dialog
      open
      onClose={onClose}
      title="Attendance rules"
      description="Shift times come from the shift master (General shift 11:00–20:00)."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => m.mutate()} loading={m.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {field("graceMinutes", "Grace time (minutes)", "Check-ins later than shift start + this are marked Late.")}
        {field("fullDayMinHours", "Full day (hours)", "Less than this is a half day.")}
        {field("halfDayMinHours", "Half day (hours)", "Less than this is absent.")}
        {field("regularizeWithinDays", "Request window (days)", "How far back a correction can be asked for.")}
        {field("regularizeMonthlyLimit", "Requests per month", "0 = no limit.")}
      </div>
    </Dialog>
  );
}
