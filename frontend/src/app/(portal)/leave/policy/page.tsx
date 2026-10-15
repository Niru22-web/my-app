"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCog, CalendarRange, FileUp, Lock, Pencil, Plus, ScrollText, Upload } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { roleInfo } from "@/lib/roles";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm";
import { FormRow, Input, Select, Textarea } from "@/components/ui/inputs";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { DataTable, type Column } from "@/components/ui/data-table";
import { useToast } from "@/components/ui/toast";
import { MONTHS, useLeavePolicy, usePolicyMutations, type LeaveTypeDef, type LeavePolicy } from "@/components/leave/policy-api";

export default function LeavePolicyPage() {
  const { user } = useAuth();
  const router = useRouter();
  const r = roleInfo(user?.role);
  const allowed = r.isAdmin || r.isOwner || r.isHR;
  const policy = useLeavePolicy();

  useEffect(() => {
    if (user && !allowed) router.replace("/leave");
  }, [user, allowed, router]);

  if (!allowed)
    return (
      <Card>
        <EmptyState icon={Lock} title="Only Admin, Owner and HR can change the leave policy" />
      </Card>
    );
  if (policy.isLoading) return <Skeleton className="h-[560px]" />;
  if (policy.isError || !policy.data) return <Card><ErrorState onRetry={() => policy.refetch()} /></Card>;

  return (
    <div className="space-y-6">
      <PageHeader title="Leave policy" description="The firm’s work calendar and leave rules. Balances everywhere in the portal are calculated from these settings." />
      <CalendarCard data={policy.data} />
      <TypesCard data={policy.data} />
      <div className="grid gap-6 xl:grid-cols-2">
        <OpeningCard />
        <CloseYearCard data={policy.data} />
      </div>
    </div>
  );
}

// ── Work calendar ────────────────────────────────────────────────────────────
const SAT_PRESETS = [
  { value: "all", label: "Every Saturday" },
  { value: "none", label: "No Saturdays (all working)" },
  { value: "2,4", label: "2nd and 4th Saturdays" },
  { value: "1,3", label: "1st and 3rd Saturdays" },
  { value: "1,3,5", label: "1st, 3rd and 5th Saturdays" },
];

function CalendarCard({ data }: { data: LeavePolicy }) {
  const toast = useToast();
  const { settings } = usePolicyMutations();
  const c = data.calendar;
  const [month, setMonth] = useState(String(c.leaveYearStartMonth));
  const [sat, setSat] = useState(c.saturdaysOff);
  const [sun, setSun] = useState(c.sundayOff);
  const [from, setFrom] = useState(c.leaveAccrualFrom ?? "");
  const [hours, setHours] = useState(String(c.standardDayHours));
  const [levels, setLevels] = useState(String(c.leaveApprovalLevels));
  const dirty =
    month !== String(c.leaveYearStartMonth) ||
    sat !== c.saturdaysOff ||
    sun !== c.sundayOff ||
    from !== (c.leaveAccrualFrom ?? "") ||
    hours !== String(c.standardDayHours) ||
    levels !== String(c.leaveApprovalLevels) ||
    !c.configured;

  return (
    <Card>
      <CardHeader icon={CalendarCog} title="Work calendar" description={c.configured ? `${c.summary} · leave year ${data.currentYear.label}` : "Not saved yet — the portal is assuming every Saturday and Sunday off."} />
      <div className="grid gap-4 p-5 pt-0 sm:grid-cols-2 xl:grid-cols-4">
        <FormRow label="Leave year starts" htmlFor="cal-month">
          <Select id="cal-month" value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="1">January (Jan–Dec)</option>
            <option value="4">April (Apr–Mar, financial year)</option>
          </Select>
        </FormRow>
        <FormRow label="Saturdays off" htmlFor="cal-sat">
          <Select id="cal-sat" value={sat} onChange={(e) => setSat(e.target.value)}>
            {SAT_PRESETS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Sundays" htmlFor="cal-sun">
          <Select id="cal-sun" value={sun ? "off" : "working"} onChange={(e) => setSun(e.target.value === "off")}>
            <option value="off">Off</option>
            <option value="working">Working</option>
          </Select>
        </FormRow>
        <FormRow label="Leave rules start on" htmlFor="cal-from" hint="Accrual counts from this month; earlier balances come in as opening balances.">
          <Input id="cal-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </FormRow>
        <FormRow label="Expected hours per working day" htmlFor="cal-hours" hint="Used for timesheet compliance and scheduled hours.">
          <Input id="cal-hours" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
        </FormRow>
        <FormRow label="Leave approval" htmlFor="cal-levels" className="sm:col-span-2 xl:col-span-3">
          <Select id="cal-levels" value={levels} onChange={(e) => setLevels(e.target.value)}>
            <option value="1">One step — anyone above the person in the reporting line</option>
            <option value="2">Two steps — reporting manager first, then reporting partner</option>
          </Select>
        </FormRow>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
        <p className="text-xs text-ink-muted">Firm holidays come from the Calendar (events of type Holiday). Shift times are in Administration → Masters → Shifts.</p>
        <Button
          size="sm"
          disabled={!dirty}
          loading={settings.isPending}
          onClick={() =>
            settings.mutate(
              { leaveYearStartMonth: Number(month), saturdaysOff: sat, sundayOff: sun, leaveAccrualFrom: from || null, standardDayHours: Number(hours), leaveApprovalLevels: Number(levels) },
              { onSuccess: () => toast.success("Work calendar saved"), onError: (e) => toast.error("Couldn’t save", e instanceof ApiError ? e.message : undefined) },
            )
          }
        >
          Save calendar
        </Button>
      </div>
    </Card>
  );
}

// ── Leave types ──────────────────────────────────────────────────────────────
function describeRule(t: LeaveTypeDef) {
  if (!t.paid) return "Unpaid (loss of pay) — no balance";
  if (t.annualDays == null) return "No fixed entitlement — credited when earned";
  const per = t.accrual === "monthly" ? `${Math.round((t.annualDays / 12) * 100) / 100} / month` : "at the start of the year";
  return `${t.annualDays} days a year, ${per}${t.prorateOnJoining ? ", pro-rated for joiners" : ""}`;
}

function TypesCard({ data }: { data: LeavePolicy }) {
  const [editing, setEditing] = useState<LeaveTypeDef | "new" | null>(null);
  const columns: Column<LeaveTypeDef>[] = [
    {
      key: "name",
      header: "Leave type",
      sortValue: (t) => t.sortOrder,
      cell: (t) => (
        <div>
          <p className="text-sm font-medium text-ink">
            {t.name} <span className="ml-1 text-xs text-ink-subtle">{t.code}</span>
          </p>
          <p className="text-xs text-ink-muted">{describeRule(t)}</p>
        </div>
      ),
    },
    {
      key: "carry",
      header: "Carry forward",
      hideBelow: "md",
      cell: (t) =>
        t.carryForward === "all" ? "All unused days" : t.carryForward === "limit" ? `Up to ${t.carryForwardMax} days` : <span className="text-ink-subtle">None — lapses</span>,
    },
    { key: "encash", header: "Encashable", hideBelow: "lg", cell: (t) => (t.encashable ? (t.encashMax ? `Yes, up to ${t.encashMax}` : "Yes") : <span className="text-ink-subtle">No</span>) },
    {
      key: "rules",
      header: "Rules",
      hideBelow: "lg",
      cell: (t) => (
        <span className="text-xs text-ink-muted">
          {[t.allowHalfDay ? "Half day OK" : "Full days only", t.countNonWorkingDays ? "Sandwich rule" : "", t.noticeDays ? `${t.noticeDays}d notice` : "", t.minServiceDays ? `after ${t.minServiceDays}d service` : "", t.allowNegative ? "Can go negative" : ""]
            .filter(Boolean)
            .join(" · ")}
        </span>
      ),
    },
    { key: "status", header: "Enabled", cell: (t) => <ActiveSwitch t={t} /> },
    {
      key: "edit",
      header: "",
      align: "right",
      cell: (t) => (
        <button onClick={() => setEditing(t)} className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink" aria-label={`Edit ${t.name}`}>
          <Pencil className="h-4 w-4" />
        </button>
      ),
    },
  ];
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 font-display text-base font-bold text-ink">
          <CalendarRange className="h-4 w-4 text-brand" aria-hidden /> Leave types
        </h3>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> Add leave type
        </Button>
      </div>
      <DataTable
        exportName="leave-types" rows={data.types} columns={columns} rowKey={(t) => t.id} initialSort={{ key: "name", dir: "asc" }} empty={{ title: "No leave types yet", description: "Add the firm’s leave types to start calculating balances." }} />
      {editing && <TypeDialog entry={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** Enable / disable a leave type straight from the list. Disabled types can't be applied for; history stays. */
function ActiveSwitch({ t }: { t: LeaveTypeDef }) {
  const toast = useToast();
  const { saveType } = usePolicyMutations();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={t.active}
      aria-label={`${t.active ? "Disable" : "Enable"} ${t.name}`}
      disabled={saveType.isPending}
      onClick={() =>
        saveType.mutate(
          { id: t.id, body: { active: !t.active } },
          {
            onSuccess: () => toast.success(`${t.name} ${t.active ? "disabled" : "enabled"}`),
            onError: (e) => toast.error("Couldn’t change it", e instanceof ApiError ? e.message : undefined),
          },
        )
      }
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${t.active ? "bg-success" : "bg-line-strong"}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${t.active ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

function TypeDialog({ entry, onClose }: { entry: LeaveTypeDef | null; onClose: () => void }) {
  const toast = useToast();
  const { saveType } = usePolicyMutations();
  const [f, setF] = useState({
    code: entry?.code ?? "",
    name: entry?.name ?? "",
    description: entry?.description ?? "",
    paid: entry?.paid ?? true,
    annualDays: entry?.annualDays != null ? String(entry.annualDays) : "",
    accrual: entry?.accrual ?? "monthly",
    prorateOnJoining: entry?.prorateOnJoining ?? true,
    carryForward: entry?.carryForward ?? "none",
    carryForwardMax: entry?.carryForwardMax != null ? String(entry.carryForwardMax) : "",
    encashable: entry?.encashable ?? false,
    encashMax: entry?.encashMax != null ? String(entry.encashMax) : "",
    allowNegative: entry?.allowNegative ?? false,
    allowHalfDay: entry?.allowHalfDay ?? true,
    countNonWorkingDays: entry?.countNonWorkingDays ?? false,
    minServiceDays: String(entry?.minServiceDays ?? 0),
    maxPerRequest: entry?.maxPerRequest != null ? String(entry.maxPerRequest) : "",
    noticeDays: String(entry?.noticeDays ?? 0),
    gender: entry?.gender ?? "all",
    active: entry?.active ?? true,
    sortOrder: String(entry?.sortOrder ?? 0),
  });
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const yes = (k: "paid" | "prorateOnJoining" | "encashable" | "allowNegative" | "allowHalfDay" | "countNonWorkingDays" | "active", label: string, hint?: string) => (
    <label className="flex items-start gap-2.5 text-[13px] text-ink">
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--brand)]" checked={f[k]} onChange={(e) => set(k, e.target.checked)} />
      <span>
        {label}
        {hint && <span className="block text-xs text-ink-subtle">{hint}</span>}
      </span>
    </label>
  );

  function save() {
    setError(null);
    if (!f.code.trim() || !f.name.trim()) return setError("Code and name are required.");
    saveType.mutate(
      {
        id: entry?.id,
        body: {
          code: f.code,
          name: f.name,
          description: f.description || null,
          paid: f.paid,
          annualDays: f.paid ? numOrNull(f.annualDays) : null,
          accrual: f.accrual,
          prorateOnJoining: f.prorateOnJoining,
          carryForward: f.paid ? (f.carryForward as LeaveTypeDef["carryForward"]) : "none",
          carryForwardMax: f.carryForward === "limit" ? numOrNull(f.carryForwardMax) : null,
          encashable: f.encashable,
          encashMax: numOrNull(f.encashMax),
          allowNegative: f.allowNegative,
          allowHalfDay: f.allowHalfDay,
          countNonWorkingDays: f.countNonWorkingDays,
          minServiceDays: Number(f.minServiceDays) || 0,
          maxPerRequest: numOrNull(f.maxPerRequest),
          noticeDays: Number(f.noticeDays) || 0,
          gender: f.gender as LeaveTypeDef["gender"],
          active: f.active,
          sortOrder: Number(f.sortOrder) || 0,
        },
      },
      {
        onSuccess: () => (toast.success(entry ? "Leave type updated" : "Leave type added"), onClose()),
        onError: (e) => setError(e instanceof ApiError ? e.message : "Couldn’t save."),
      },
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={entry ? `Edit ${entry.name}` : "Add leave type"}
      description="Changes apply to every balance straight away — balances are recalculated, not stored."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saveType.isPending}>
            Cancel
          </Button>
          <Button onClick={save} loading={saveType.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Name" htmlFor="lt-name" required hint={entry ? "Used on existing requests — rename only if unused." : undefined}>
          <Input id="lt-name" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Paid Leave" />
        </FormRow>
        <FormRow label="Short code" htmlFor="lt-code" required>
          <Input id="lt-code" value={f.code} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="e.g. PL" maxLength={8} />
        </FormRow>
        <FormRow label="Description" htmlFor="lt-desc" className="sm:col-span-2">
          <Textarea id="lt-desc" rows={2} value={f.description} onChange={(e) => set("description", e.target.value)} />
        </FormRow>
        <div className="space-y-3 sm:col-span-2">{yes("paid", "Paid leave", "Untick for loss-of-pay leave (no balance, shown in payroll as LOP).")}</div>
        {f.paid && (
          <>
            <FormRow label="Days per leave year" htmlFor="lt-days" hint="Leave blank for earned leave such as comp-off (credited by managers/HR).">
              <Input id="lt-days" inputMode="decimal" value={f.annualDays} onChange={(e) => set("annualDays", e.target.value)} placeholder="e.g. 15" />
            </FormRow>
            <FormRow label="Credited" htmlFor="lt-acc">
              <Select id="lt-acc" value={f.accrual} onChange={(e) => set("accrual", e.target.value as "yearly" | "monthly")}>
                <option value="monthly">Monthly (1/12 at the start of each month)</option>
                <option value="yearly">Yearly (all at the start of the year)</option>
              </Select>
            </FormRow>
            <FormRow label="At year end, unused days" htmlFor="lt-cfm">
              <Select id="lt-cfm" value={f.carryForward} onChange={(e) => set("carryForward", e.target.value as LeaveTypeDef["carryForward"])}>
                <option value="all">Carry forward — all of them</option>
                <option value="limit">Carry forward — up to a limit</option>
                <option value="none">Lapse</option>
              </Select>
            </FormRow>
            {f.carryForward === "limit" && (
              <FormRow label="Carry forward up to (days)" htmlFor="lt-cf">
                <Input id="lt-cf" inputMode="decimal" value={f.carryForwardMax} onChange={(e) => set("carryForwardMax", e.target.value)} />
              </FormRow>
            )}
            <FormRow label="Max days per request" htmlFor="lt-max" hint="Blank = no limit.">
              <Input id="lt-max" inputMode="decimal" value={f.maxPerRequest} onChange={(e) => set("maxPerRequest", e.target.value)} />
            </FormRow>
          </>
        )}
        <FormRow label="Apply at least (days ahead)" htmlFor="lt-notice" hint="A reminder, not a block.">
          <Input id="lt-notice" inputMode="numeric" value={f.noticeDays} onChange={(e) => set("noticeDays", e.target.value)} />
        </FormRow>
        <FormRow label="Available after (days of service)" htmlFor="lt-svc">
          <Input id="lt-svc" inputMode="numeric" value={f.minServiceDays} onChange={(e) => set("minServiceDays", e.target.value)} />
        </FormRow>
        <FormRow label="Applies to" htmlFor="lt-gender">
          <Select id="lt-gender" value={f.gender} onChange={(e) => set("gender", e.target.value as LeaveTypeDef["gender"])}>
            <option value="all">Everyone</option>
            <option value="female">Women only</option>
            <option value="male">Men only</option>
          </Select>
        </FormRow>
        <FormRow label="Display order" htmlFor="lt-order">
          <Input id="lt-order" inputMode="numeric" value={f.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} />
        </FormRow>
        <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
          {f.paid && yes("prorateOnJoining", "Pro-rate for joiners", "Joined after the 15th → from the next month.")}
          {yes("allowHalfDay", "Half days allowed")}
          {yes("countNonWorkingDays", "Sandwich rule", "Weekly offs and holidays inside a leave count as leave.")}
          {f.paid && yes("allowNegative", "Balance may go below zero")}
          {f.paid && yes("encashable", "Encashable")}
          {yes("active", "Active", "Inactive types can’t be applied for; history is kept.")}
        </div>
        {f.paid && f.encashable && (
          <FormRow label="Max encashable days per year" htmlFor="lt-enc" hint="Blank = no limit.">
            <Input id="lt-enc" inputMode="decimal" value={f.encashMax} onChange={(e) => set("encashMax", e.target.value)} />
          </FormRow>
        )}
        {error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger sm:col-span-2">{error}</p>}
      </div>
    </Dialog>
  );
}

// ── Opening balances ─────────────────────────────────────────────────────────
function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows = lines.map((l) => l.split(/[,\t;]/).map((c) => c.trim().replace(/^"|"$/g, "")));
  const body = rows.length && Number.isNaN(Number(rows[0][2])) ? rows.slice(1) : rows;
  return body.filter((r) => r.length >= 3).map((r) => ({ employeeCode: r[0], type: r[1], days: Number(r[2]) }));
}

function OpeningCard() {
  const toast = useToast();
  const { opening } = usePolicyMutations();
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ saved: number; problems: string[]; problemCount: number } | null>(null);
  const rows = parseCsv(text);
  return (
    <Card>
      <CardHeader icon={FileUp} title="Opening balances" description="Bring in balances as of the day leave rules start — e.g. closing balances exported from Zoho." />
      <div className="space-y-3 p-5 pt-0">
        <p className="text-xs text-ink-muted">
          One row per person and leave type: <code className="rounded bg-surface-muted px-1">Employee ID, Leave type (code or name), Days</code>. Re-importing replaces the earlier opening balance.
        </p>
        <Textarea rows={5} value={text} onChange={(e) => (setText(e.target.value), setResult(null))} placeholder={"Employee ID,Leave type,Days\n1021,PL,6.5\n1109,PL,3"} aria-label="Opening balances CSV" />
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-brand hover:underline">
            <Upload className="h-4 w-4" aria-hidden /> Choose a CSV file
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) setText(await file.text());
                e.target.value = "";
              }}
            />
          </label>
          <span className="text-xs text-ink-subtle">{rows.length ? `${rows.length} row(s) ready` : ""}</span>
          <Button
            size="sm"
            className="ml-auto"
            disabled={!rows.length}
            loading={opening.isPending}
            onClick={() =>
              opening.mutate(
                { rows },
                {
                  onSuccess: (r) => {
                    setResult(r.data);
                    toast.success(`${r.data.saved} opening balance(s) saved`, r.data.problemCount ? `${r.data.problemCount} row(s) need attention` : undefined);
                  },
                  onError: (e) => toast.error("Import failed", e instanceof ApiError ? e.message : undefined),
                },
              )
            }
          >
            Import
          </Button>
        </div>
        {result && result.problemCount > 0 && (
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning">
            {result.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
            {result.problemCount > result.problems.length && <li>…and {result.problemCount - result.problems.length} more</li>}
          </ul>
        )}
      </div>
    </Card>
  );
}

// ── Year-end close ───────────────────────────────────────────────────────────
function CloseYearCard({ data }: { data: LeavePolicy }) {
  const toast = useToast();
  const { closeYear } = usePolicyMutations();
  const [confirm, setConfirm] = useState(false);
  const prev = data.currentYear.year - 1;
  const startMonth = MONTHS[data.calendar.leaveYearStartMonth - 1];
  const label = data.calendar.leaveYearStartMonth === 1 ? String(prev) : `${prev}–${String(prev + 1).slice(2)}`;
  return (
    <Card>
      <CardHeader icon={ScrollText} title="Year-end close" description={`Leave year runs from 1 ${startMonth}. Current year: ${data.currentYear.label} (${formatDate(data.currentYear.start)} – ${formatDate(data.currentYear.end)}).`} />
      <div className="space-y-3 p-5 pt-0 text-[13px] text-ink-muted">
        <p>Closing a year carries each person’s unused balance forward up to the leave type’s limit and lapses the rest. It only ever runs once per year and is recorded in each person’s balance history.</p>
        <Button variant="secondary" size="sm" onClick={() => setConfirm(true)}>
          Close leave year {label}
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Close leave year ${label}?`}
        description="Unused days are carried forward up to each type’s limit; the rest lapse. This can’t be undone from the portal."
        confirmLabel="Close year"
        busy={closeYear.isPending}
        onConfirm={() =>
          closeYear.mutate(prev, {
            onSuccess: (r) => (toast.success(`Leave year ${label} closed`, `${r.data.carried} day(s) carried forward, ${r.data.lapsed} lapsed`), setConfirm(false)),
            onError: (e) => (toast.error("Couldn’t close the year", e instanceof ApiError ? e.message : undefined), setConfirm(false)),
          })
        }
      />
    </Card>
  );
}
