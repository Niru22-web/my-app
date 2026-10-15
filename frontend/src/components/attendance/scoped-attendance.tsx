"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Clock4, Download, Eye, LogOut, MapPin, Pencil, UserCheck, UserX, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError, assetUrl } from "@/lib/api";
import { fmtDay, today, type YMD } from "@/lib/dates";
import { formatHours, formatTime } from "@/lib/format";
import { roleLabel } from "@/lib/roles";
import { cn } from "@/lib/cn";
import { SCOPE_TEXT, useScopePeople, useScopes } from "@/lib/scopes";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm";
import { FormRow, Input, Select } from "@/components/ui/inputs";
import { useToast } from "@/components/ui/toast";
import {


  csvEscape,
  fromLocalInput,
  useAttendanceAccess,
  STATUS_TEXT,
  toLocalInput,
  useAttendanceCorrections,
  useAttendanceLogs,
  type DayRecord,
} from "@/components/attendance/api";

type Source = "all" | "web" | "biometric";
type StatusF = "all" | DayRecord["status"] | "open";

const statusTone = { present: "success", "auto-closed": "warning", absent: "danger", other: "neutral" } as const;

/** Team and Organization attendance — the same screen, scoped by the API. */
export function ScopedAttendance({ scope }: { scope: "team" | "org" }) {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const access = useAttendanceAccess();
  const scopes = useScopes();
  // IT sees firm-wide attendance only with the Attendance permission (firm decision).
  const allowed = !!scopes.data?.[scope] && (scope === "team" || !access.isIT || access.firmWide);
  const firmWide = scope === "org";
  const corrector = access.correct;

  const [from, setFrom] = useState<YMD>(() => today());
  const [to, setTo] = useState<YMD>(() => today());
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<Source>("all");
  const [status, setStatus] = useState<StatusF>("all");
  const [detail, setDetail] = useState<DayRecord | null>(null);
  const [editing, setEditing] = useState<DayRecord | null>(null);
  const [forcing, setForcing] = useState<DayRecord | null>(null);

  useEffect(() => {
    if (scopes.data && !allowed && !access.loading) router.replace("/attendance/dashboard");
  }, [scopes.data, allowed, access.loading, router]);

  const logs = useAttendanceLogs(from, to, allowed, scope);
  const people = useScopePeople(scope, allowed);
  const fix = useAttendanceCorrections();

  // The API already limits rows to this view.
  const scoped = useMemo(() => logs.data ?? [], [logs.data]);

  const rows = scoped.filter((r) => {
    if (source !== "all" && r.source !== source) return false;
    if (status === "open" ? !r.openSession : status !== "all" && r.status !== status) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!`${r.employee?.name ?? ""} ${r.employeeCode}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  if (!allowed) return null;

  const singleDay = from === to;
  const presentPeople = new Set(scoped.map((r) => r.employeeCode)).size;
  // Firm-wide views count everyone (yourself included); team views count only your reports — on both sides.
  const activeList = (people.data ?? []).filter((p) => (firmWide || p.id !== user?.id) && (p.status ?? "active").toLowerCase() === "active");
  const activePeople = activeList.length;
  const activeCodes = new Set(activeList.map((p) => p.employeeId));
  const presentActive = new Set(scoped.filter((r) => activeCodes.has(r.employeeCode)).map((r) => r.employeeCode)).size;
  const withHours = scoped.filter((r) => r.hours > 0);
  const avg = withHours.length ? withHours.reduce((a, r) => a + r.hours, 0) / withHours.length : 0;

  function exportCsv() {
    const header = ["Employee ID", "Employee", "Date", "First in", "Last out", "Hours", "Sessions", "Source", "Status", "Location"];
    const lines = rows.map((r) =>
      [r.employeeCode, r.employee?.name, r.day, formatTime(r.firstIn), r.lastOut ? formatTime(r.lastOut) : "", r.hours.toFixed(2), r.sessions.length, r.source === "biometric" ? "Biometric" : "Web/Mobile", STATUS_TEXT[r.status], r.location]
        .map(csvEscape)
        .join(","),
    );
    const blob = new Blob(["﻿" + [header.join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${from}${singleDay ? "" : `_to_${to}`}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const columns: Column<DayRecord>[] = [
    {
      key: "employee",
      header: "Employee",
      sortValue: (r) => r.employee?.name ?? r.employeeCode,
      cell: (r) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={r.employee?.name} src={assetUrl(r.employee?.photo)} size={32} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{r.employee?.name ?? r.employeeCode}</p>
            <p className="truncate text-xs text-ink-subtle">
              {r.employeeCode}
              {r.employee?.role ? ` · ${roleLabel(r.employee.role)}` : ""}
            </p>
          </div>
        </div>
      ),
    },
    { key: "day", header: "Date", sortValue: (r) => r.day, hideBelow: "md", cell: (r) => <span className="whitespace-nowrap">{fmtDay(r.day)}</span> },
    { key: "in", header: "First in", sortValue: (r) => r.firstIn ?? "", cell: (r) => <span className="tabular">{formatTime(r.firstIn)}</span> },
    {
      key: "out",
      header: "Last out",
      sortValue: (r) => r.lastOut ?? "",
      hideBelow: "sm",
      cell: (r) => (r.openSession ? <Badge tone="success">Checked in</Badge> : <span className="tabular">{formatTime(r.lastOut)}</span>),
    },
    {
      key: "hours",
      header: "Hours",
      align: "right",
      sortValue: (r) => r.hours,
      cell: (r) => (
        <span>
          <span className="font-semibold">{formatHours(r.hours)}</span>
          <span className="block text-[11px] text-ink-subtle">
            {r.sessions.length} session{r.sessions.length === 1 ? "" : "s"}
          </span>
        </span>
      ),
    },
    { key: "source", header: "Source", hideBelow: "lg", sortValue: (r) => r.source, cell: (r) => <span className="text-ink-muted">{r.source === "biometric" ? "Biometric" : "Web / mobile"}</span> },
    { key: "status", header: "Status", hideBelow: "sm", sortValue: (r) => r.status, cell: (r) => <Badge tone={statusTone[r.status]}>{STATUS_TEXT[r.status]}</Badge> },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (r) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <IconBtn label="View details" onClick={() => setDetail(r)} icon={Eye} />
          {corrector && <IconBtn label="Correct times" onClick={() => setEditing(r)} icon={Pencil} />}
          {corrector && r.openSession && <IconBtn label="Force check-out" onClick={() => setForcing(r)} icon={LogOut} danger />}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={firmWide ? "Organization attendance" : "Team attendance"}
        description={SCOPE_TEXT[scope]}
      />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="Summary">
        <StatCard label={singleDay ? "Present" : "People with attendance"} icon={UserCheck} tone="brand" loading={logs.isLoading} value={presentPeople} hint={singleDay ? fmtDay(from, { day: "numeric", month: "short" }) : `${fmtDay(from, { day: "numeric", month: "short" })} – ${fmtDay(to, { day: "numeric", month: "short" })}`} />
        {singleDay ? (
          <StatCard
            label="Not checked in"
            icon={UserX}
            loading={logs.isLoading || people.isLoading}
            value={people.data ? Math.max(0, activePeople - presentActive) : "—"}
            hint={people.data ? `of ${activePeople} active` : undefined}
            tone={people.data && activePeople - presentActive > 0 ? "warning" : "neutral"}
          />
        ) : (
          <StatCard label="Day records" icon={CalendarDays} loading={logs.isLoading} value={scoped.length} />
        )}
        <StatCard label="Checked in now" icon={Users} loading={logs.isLoading} value={scoped.filter((r) => r.openSession).length} tone="success" />
        <StatCard label="Avg hours per day" icon={Clock4} loading={logs.isLoading} value={avg ? formatHours(avg) : "—"} hint={scoped.filter((r) => r.status === "auto-closed").length ? `${scoped.filter((r) => r.status === "auto-closed").length} auto-closed` : undefined} />
      </section>

      <DataTable
        exportName={false}
        itemsLabel="records"
        filterTabs={[
          { key: "all", label: "All", count: scoped.length },
          { key: "open", label: "Checked in now", count: scoped.filter((r) => r.openSession).length },
          { key: "present", label: "Present", count: scoped.filter((r) => r.status === "present").length },
          { key: "auto-closed", label: "Auto-closed", count: scoped.filter((r) => r.status === "auto-closed").length },
        ]}
        activeFilterTab={status}
        onFilterTabChange={(k) => setStatus(k as StatusF)}
        searchable
        searchPlaceholder="Name or employee ID"
        searchValue={search}
        onSearchChange={setSearch}
        toolbarActions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Select aria-label="Source" value={source} onChange={(e) => setSource(e.target.value as Source)} className="w-36">
              <option value="all">All sources</option>
              <option value="web">Web / mobile</option>
              <option value="biometric">Biometric</option>
            </Select>
            <Input type="date" aria-label="From" title="From" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className="h-9 w-[150px]" />
            <Input type="date" aria-label="To" title="To" value={to} min={from} max={today()} onChange={(e) => e.target.value && setTo(e.target.value)} className="h-9 w-[150px]" />
            <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!rows.length}>
              <Download className="h-4 w-4" /> Export
            </Button>
          </div>
        }
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        loading={logs.isLoading || (!firmWide && people.isLoading)}
        error={logs.isError}
        onRetry={() => logs.refetch()}
        onRowClick={setDetail}
        initialSort={{ key: "in", dir: "asc" }}
        pageSize={20}
        empty={{ icon: CalendarDays, title: "No attendance recorded", description: singleDay ? "No one in this view has checked in on this day yet." : "No records match these filters." }}
      />

      <DetailDialog record={detail} onClose={() => setDetail(null)} />

      {editing && (
        <EditDialog
          record={editing}
          busy={fix.update.isPending}
          onClose={() => setEditing(null)}
          onSave={(checkInTime, checkOutTime) =>
            fix.update.mutate(
              { employeeId: editing.employeeCode, date: editing.storedDate, checkInTime, checkOutTime },
              {
                onSuccess: () => (toast.success("Attendance corrected", `${editing.employee?.name ?? editing.employeeCode} · ${fmtDay(editing.day)}`), setEditing(null)),
                onError: (e) => toast.error("Couldn’t save the correction", e instanceof ApiError ? e.message : undefined),
              },
            )
          }
        />
      )}

      <ConfirmDialog
        open={!!forcing}
        onClose={() => setForcing(null)}
        tone="danger"
        title="Force check-out?"
        confirmLabel="Check out now"
        busy={fix.forceCheckout.isPending}
        description={forcing ? `${forcing.employee?.name ?? forcing.employeeCode}’s open session will be closed at the current time. Use this when someone forgot to check out.` : undefined}
        onConfirm={() =>
          forcing &&
          fix.forceCheckout.mutate(
            { employeeId: forcing.employeeCode, date: forcing.storedDate },
            {
              onSuccess: () => (toast.success("Checked out"), setForcing(null)),
              onError: (e) => toast.error("Couldn’t check out", e instanceof ApiError ? e.message : undefined),
            },
          )
        }
      />
    </div>
  );
}

function IconBtn({ label, onClick, icon: Icon, danger }: { label: string; onClick: () => void; icon: typeof Eye; danger?: boolean }) {
  return (
    <button onClick={onClick} title={label} aria-label={label} className={cn("grid h-8 w-8 place-items-center rounded-lg", danger ? "text-danger hover:bg-danger-soft" : "text-ink-muted hover:bg-surface-muted hover:text-ink")}>
      <Icon className="h-4 w-4" />
    </button>
  );
}

function DetailDialog({ record: r, onClose }: { record: DayRecord | null; onClose: () => void }) {
  return (
    <Dialog
      open={!!r}
      onClose={onClose}
      title={r?.employee?.name ?? r?.employeeCode ?? "Attendance"}
      description={r ? `${fmtDay(r.day, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${r.employeeCode}` : undefined}
      footer={
        r ? (
          <Link href={`/attendance/monthly/${encodeURIComponent(r.employeeCode)}?month=${r.day.slice(0, 7)}`} className="inline-flex h-10 items-center rounded-xl bg-brand px-4 text-sm font-medium text-brand-ink hover:bg-brand-hover">
            View month
          </Link>
        ) : undefined
      }
    >
      {r && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Tile label="Hours" value={formatHours(r.hours)} />
            <Tile label="Sessions" value={String(r.sessions.length)} />
            <Tile label="Status" value={STATUS_TEXT[r.status]} />
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Timeline</p>
            {r.sessions.length === 0 ? (
              <p className="text-sm text-ink-muted">No sessions recorded.</p>
            ) : (
              <ol className="space-y-2">
                {r.sessions.map((s, i) => (
                  <li key={s.id} className="rounded-xl border border-line px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-ink tabular">
                        {i + 1}. {formatTime(s.check_in_time)} – {s.check_out_time ? formatTime(s.check_out_time) : "open"}
                      </p>
                      <span className="text-sm font-semibold tabular">{s.check_out_time ? formatHours((s.duration ?? 0) / 60) : <Badge tone="success">In progress</Badge>}</span>
                    </div>
                    {(s.location_name || s.check_in_location) && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-ink-subtle">
                        <MapPin className="h-3 w-3" aria-hidden /> {s.location_name || s.check_in_location}
                      </p>
                    )}
                    {s.is_auto_checkout && <p className="mt-1 text-xs text-warning">Closed automatically by the system</p>}
                  </li>
                ))}
              </ol>
            )}
          </div>
          <p className="text-xs text-ink-subtle">Source: {r.source === "biometric" ? "Biometric device" : "Web / mobile check-in"}</p>
        </div>
      )}
    </Dialog>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-muted px-3 py-2.5">
      <p className="text-[11px] text-ink-subtle">{label}</p>
      <p className="font-display text-base font-bold text-ink">{value}</p>
    </div>
  );
}

function EditDialog({ record, onClose, onSave, busy }: { record: DayRecord; onClose: () => void; onSave: (inIso: string, outIso: string) => void; busy: boolean }) {
  const [inV, setIn] = useState(toLocalInput(record.firstIn));
  const [outV, setOut] = useState(toLocalInput(record.lastOut));
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title="Correct attendance"
      description={`${record.employee?.name ?? record.employeeCode} · ${fmtDay(record.day, { weekday: "long", day: "numeric", month: "long" })}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            loading={busy}
            onClick={() => {
              if (!inV || !outV) return setError("Enter both the check-in and check-out time.");
              if (new Date(outV) <= new Date(inV)) return setError("Check-out must be after check-in.");
              onSave(fromLocalInput(inV), fromLocalInput(outV));
            }}
          >
            Save correction
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormRow label="Check-in" htmlFor="fix-in" required>
          <Input id="fix-in" type="datetime-local" value={inV} onChange={(e) => setIn(e.target.value)} />
        </FormRow>
        <FormRow label="Check-out" htmlFor="fix-out" required>
          <Input id="fix-out" type="datetime-local" value={outV} min={inV} onChange={(e) => setOut(e.target.value)} />
        </FormRow>
        <p className="text-xs text-ink-subtle">
          Times are in your local time zone. The first check-in and last check-out of the day are updated, and the day is marked Present.
        </p>
        {error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
