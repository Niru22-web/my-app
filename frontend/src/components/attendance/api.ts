"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { addDays, toYMD, workDate, type YMD } from "@/lib/dates";
import { normRole } from "@/lib/roles";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";
import type { Envelope } from "@/lib/types";

// ---- Shapes returned by /api/attendance ---------------------------------------

export interface Session {
  id: string;
  check_in_time: string;
  check_out_time: string | null;
  duration: number | null; // minutes
  location_name: string | null;
  check_in_location: string | null;
  check_out_location: string | null;
  is_auto_checkout?: boolean;
}

interface RawEmployee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  role?: string;
  designation?: string | null;
  department?: string | null;
  profileImage?: string | null;
}

interface RawLogRow {
  id: string;
  employee_id: string;
  date: string;
  status: string;
  total_hours: number;
  attendance_source: string;
  is_auto_checkout: boolean;
  check_in_time: string | null;
  check_out_time: string | null;
  location_name: string | null;
  check_in_location: string | null;
  attendance_sessions?: Session[];
  employee?: RawEmployee | null;
  Employee?: RawEmployee | null;
}

/** A day's attendance for one person, normalised for the UI. Only safe employee fields are kept. */
export interface DayRecord {
  id: string;
  employeeCode: string;
  /** Stored day key, needed when calling the API back. */
  storedDate: YMD;
  /** Day the work actually happened (from first check-in, local time). */
  day: YMD;
  status: "present" | "auto-closed" | "absent" | "other";
  statusRaw: string;
  hours: number;
  source: "web" | "biometric";
  firstIn: string | null;
  lastOut: string | null;
  openSession: boolean;
  location: string | null;
  sessions: Session[];
  employee: { uuid: string; code: string; name: string; role: string; designation: string | null; department: string | null; photo: string | null } | null;
}

export function normStatus(s: string | null | undefined): DayRecord["status"] {
  const v = (s ?? "").toLowerCase();
  if (v === "present") return "present";
  if (v === "incomplete") return "auto-closed";
  if (v === "absent") return "absent";
  return "other";
}

export const STATUS_TEXT: Record<DayRecord["status"], string> = {
  present: "Present",
  "auto-closed": "Auto-closed",
  absent: "Absent",
  other: "Recorded",
};

function dayOf(storedDate: string, firstIn: string | null): YMD {
  // The API stores some days one day early (known backend bug); the first check-in time is reliable.
  return firstIn ? toYMD(new Date(firstIn)) : workDate(storedDate);
}

function normalise(r: RawLogRow): DayRecord {
  const e = r.employee ?? r.Employee ?? null;
  const sessions = [...(r.attendance_sessions ?? [])].sort((a, b) => a.check_in_time.localeCompare(b.check_in_time));
  const firstIn = sessions[0]?.check_in_time ?? r.check_in_time;
  const lastSession = sessions[sessions.length - 1];
  const lastOut = lastSession ? lastSession.check_out_time : r.check_out_time;
  return {
    id: r.id,
    employeeCode: r.employee_id,
    storedDate: workDate(r.date),
    day: dayOf(r.date, firstIn),
    status: normStatus(r.status),
    statusRaw: r.status,
    hours: Number(r.total_hours ?? 0),
    source: (r.attendance_source ?? "").toUpperCase() === "ESSL" ? "biometric" : "web",
    firstIn: firstIn ?? null,
    lastOut: lastOut ?? null,
    openSession: sessions.some((s) => !s.check_out_time),
    location: r.location_name || r.check_in_location || sessions[0]?.location_name || null,
    sessions,
    employee: e
      ? {
          uuid: e.id,
          code: e.employeeId,
          name: `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim(),
          role: e.role ?? "",
          designation: e.designation ?? null,
          department: e.department ?? null,
          photo: e.profileImage ?? null,
        }
      : null,
  };
}

const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);

/**
 * The legacy check-out writes a second "phantom" day row (dated a day early, no sessions,
 * copied in/out times) next to the real one. Collapse rows for the same person + real day.
 */
export function mergeDays(records: DayRecord[]): DayRecord[] {
  const byKey = new Map<string, DayRecord>();
  for (const r of records) {
    const key = `${r.employeeCode}|${r.day}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, r);
      continue;
    }
    // Keep the row that owns the sessions as the base (its stored date is the one the API acts on).
    const [base, other] = prev.sessions.length >= r.sessions.length ? [prev, r] : [r, prev];
    const sessions = [...base.sessions, ...other.sessions.filter((s) => !base.sessions.some((b) => b.id === s.id))].sort((a, b) =>
      a.check_in_time.localeCompare(b.check_in_time),
    );
    const open = sessions.some((s) => !s.check_out_time);
    byKey.set(key, {
      ...base,
      sessions,
      openSession: open,
      hours: Math.max(base.hours, other.hours),
      lastOut: open ? null : later(base.lastOut, other.lastOut),
      status: base.status === "auto-closed" || other.status === "auto-closed" ? "auto-closed" : base.status,
      employee: base.employee ?? other.employee,
      location: base.location ?? other.location,
    });
  }
  return [...byKey.values()];
}

// ---- Access ---------------------------------------------------------------------

/**
 * Team-log access. Admin/Owner/HR (firm-wide) and Manager/Partner (own team) by role.
 * IT gets access only when an Admin grants the Attendance permission (view → logs, edit → corrections).
 */
export function useAttendanceAccess() {
  const { user } = useAuth();
  const { granted, loading } = usePermissions();
  const r = normRole(user?.role);
  const it = r === "it";
  const firmRole = ["admin", "owner", "hr"].includes(r);
  const teamLogs = firmRole || ["manager", "partner"].includes(r) || (it && granted("attendance", "canView"));
  return {
    teamLogs,
    isIT: it,
    firmWide: firmRole || (it && teamLogs),
    correct: firmRole || (it && granted("attendance", "canEdit")),
    /** True while an IT user's permissions are still loading (don't redirect yet). */
    loading: it && loading,
  };
}

// ---- Queries ----------------------------------------------------------------------

export function useAttendanceLogs(from: YMD, to: YMD, enabled = true, scope?: "team" | "org") {
  return useQuery({
    queryKey: ["attendance", "all", from, to, scope ?? "role"],
    // Day keys can be stored one day early, so widen the window by a day and filter on the real day.
    queryFn: async () => {
      const rows = (await api<Envelope<RawLogRow[]>>("attendance/all", { query: { startDate: addDays(from, -1), endDate: to, scope } })).data ?? [];
      return mergeDays(rows.map(normalise)).filter((r) => r.day >= from && r.day <= to);
    },
    enabled,
  });
}

export interface MonthDay {
  day: YMD;
  storedDate: YMD;
  status: DayRecord["status"];
  hours: number;
  sessions: number;
  firstIn: string | null;
  lastOut: string | null;
}

interface RawMonthly {
  employee: RawEmployee | null;
  month: string;
  dailyStats: { date: string; status: string; totalHours: number; sessionCount: number; checkInTime: string | null; checkOutTime: string | null }[];
}

/** One employee's month (`employeeCode` is the human code, e.g. EMP001). */
export function useMonthly(employeeCode: string | undefined, month: string /* YYYY-MM */) {
  return useQuery({
    queryKey: ["attendance", "monthly", employeeCode, month],
    queryFn: async () => {
      const d = (await api<Envelope<RawMonthly>>("attendance/monthly", { query: { employeeId: employeeCode, month } })).data;
      const e = d?.employee;
      return {
        employee: e
          ? { uuid: e.id, code: e.employeeId, name: `${e.firstName} ${e.lastName}`.trim(), designation: e.designation ?? null, department: e.department ?? null, photo: e.profileImage ?? null }
          : null,
        days: (d?.dailyStats ?? []).map(
          (s): MonthDay => ({
            day: dayOf(s.date, s.checkInTime),
            storedDate: workDate(s.date),
            status: normStatus(s.status),
            hours: Number(s.totalHours ?? 0),
            sessions: s.sessionCount ?? 0,
            firstIn: s.checkInTime,
            lastOut: s.checkOutTime,
          }),
        ),
      };
    },
    enabled: !!employeeCode,
  });
}

export interface WeeklyPulse {
  thisWeekHours: number;
  prevWeekHours: number;
  hoursDiff: number;
  percentDiff: number;
  thisWeekDays: Record<string, number>;
  prevWeekDays: Record<string, number>;
}

export function useWeeklyPulse(prevMonday: YMD, thisSunday: YMD) {
  return useQuery({
    queryKey: ["attendance", "weekly-pulse", prevMonday, thisSunday],
    queryFn: async () => (await api<Envelope<WeeklyPulse>>("attendance/weekly-pulse", { query: { startDate: prevMonday, endDate: thisSunday } })).data,
    // Every 2 minutes while visible, plus on return to the tab (was every minute).
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

interface TeamMember {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  status?: string;
}

/** People the signed-in user is allowed to see (the employees API is scoped by role). */
export function useScopedPeople(enabled: boolean) {
  return useQuery({
    queryKey: ["lookup", "people-scope"],
    queryFn: async () => {
      const res = await api<Envelope<TeamMember[]> | TeamMember[]>("employees");
      const rows = Array.isArray(res) ? res : (res.data ?? []);
      return rows.map(({ id, employeeId, firstName, lastName, status }) => ({ id, employeeId, firstName, lastName, status }));
    },
    enabled,
    staleTime: 5 * 60_000,
  });
}

// ---- Corrections (admin / HR / IT) --------------------------------------------------

export function useAttendanceCorrections() {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: ["attendance"] });
  return {
    forceCheckout: useMutation({
      mutationFn: (b: { employeeId: string; date: YMD }) => api("attendance/force-checkout", { method: "POST", body: b }),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: (b: { employeeId: string; date: YMD; checkInTime: string; checkOutTime: string }) => api("attendance/update", { method: "PUT", body: b }),
      onSuccess: refresh,
    }),
  };
}

// ---- Helpers ------------------------------------------------------------------------

/** ISO instant → value for <input type="datetime-local"> in the viewer's local time. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value (local time) → ISO instant. */
export function fromLocalInput(v: string): string {
  return new Date(v).toISOString();
}

export function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
