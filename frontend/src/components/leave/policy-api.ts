"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Envelope } from "@/lib/types";
import { setWeeklyOffs } from "@/lib/work-calendar";

export interface LeaveTypeDef {
  id: string;
  code: string;
  name: string;
  description: string | null;
  paid: boolean;
  annualDays: number | null;
  accrual: "yearly" | "monthly";
  prorateOnJoining: boolean;
  carryForward: "none" | "all" | "limit";
  carryForwardMax: number | null;
  encashable: boolean;
  encashMax: number | null;
  allowNegative: boolean;
  allowHalfDay: boolean;
  countNonWorkingDays: boolean;
  minServiceDays: number;
  maxPerRequest: number | null;
  noticeDays: number;
  gender: "all" | "female" | "male";
  active: boolean;
  sortOrder: number;
}

export interface LeavePolicy {
  calendar: {
    leaveYearStartMonth: number;
    saturdaysOff: string;
    sundayOff: boolean;
    leaveAccrualFrom: string | null;
    standardDayHours: number;
    leaveApprovalLevels: number;
    configured: boolean;
    summary: string;
  };
  currentYear: { year: number; label: string; start: string; end: string };
  types: LeaveTypeDef[];
}

export interface TypeBalance {
  leaveTypeId: string;
  code: string;
  name: string;
  paid: boolean;
  entitled: number | null;
  accrued: number;
  opening: number;
  adjusted: number;
  used: number;
  pending: number;
  encashed: number;
  lapsed: number;
  available: number;
  closed: boolean;
}

export function useLeavePolicy() {
  return useQuery({
    queryKey: ["leave-policy"],
    queryFn: () => api<Envelope<LeavePolicy>>("leave-policy").then((r) => r.data),
    staleTime: 5 * 60_000,
  });
}

/** Keeps the browser's weekly-off rule (used by every calendar and day count) in step with the firm settings. */
export function WorkCalendarSync() {
  const p = useLeavePolicy();
  const cal = p.data?.calendar;
  useEffect(() => {
    if (cal) setWeeklyOffs({ saturdaysOff: cal.saturdaysOff, sundayOff: cal.sundayOff, standardDayHours: cal.standardDayHours });
  }, [cal]);
  return null;
}

export function useMyBalances(employeeId?: string, enabled = true) {
  return useQuery({
    queryKey: ["leaves", "type-balances", employeeId ?? "me"],
    queryFn: () => api<Envelope<{ year: number; label: string; balances: TypeBalance[] }>>("leave-policy/balances/me", { query: { employeeId } }).then((r) => r.data),
    enabled,
  });
}

export interface ScopeBalances {
  year: number;
  label: string;
  types: LeaveTypeDef[];
  people: { id: string; employeeId: string; firstName: string; lastName: string; designation: string; balances: TypeBalance[] }[];
}
export function useScopeBalances(scope: "team" | "org", enabled = true) {
  return useQuery({
    queryKey: ["leaves", "type-balances", scope],
    queryFn: () => api<Envelope<ScopeBalances>>("leave-policy/balances", { query: { scope } }).then((r) => r.data),
    enabled,
  });
}

export interface Preview { days: number; available: number | null; errors: string[]; warnings: string[] }
export function useLeavePreview(input: { type: string; fromDate: string; toDate: string; duration: string; leaveId?: string } | null) {
  return useQuery({
    queryKey: ["leave-preview", input],
    queryFn: () => api<Envelope<Preview>>("leave-policy/preview", { method: "POST", body: input }).then((r) => r.data),
    enabled: !!input && !!input.type && !!input.fromDate && !!input.toDate,
    staleTime: 10_000,
  });
}

export interface LedgerRow { id: string; kind: string; days: number; note: string | null; year: number; createdAt: string; leaveType: { name: string; code: string } }
export function useLeaveLedger(employeeId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["leaves", "ledger", employeeId],
    queryFn: () => api<Envelope<LedgerRow[]>>("leave-policy/ledger", { query: { employeeId } }).then((r) => r.data ?? []),
    enabled: enabled && !!employeeId,
  });
}

export function usePolicyMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["leave-policy"] });
    void qc.invalidateQueries({ queryKey: ["leaves"] });
    void qc.invalidateQueries({ queryKey: ["reports"] });
  };
  return {
    settings: useMutation({
      mutationFn: (b: {
        leaveYearStartMonth: number;
        saturdaysOff: string;
        sundayOff: boolean;
        leaveAccrualFrom: string | null;
        standardDayHours: number;
        leaveApprovalLevels: number;
      }) =>
        api("leave-policy/settings", { method: "PUT", body: b }),
      onSuccess: refresh,
    }),
    saveType: useMutation({
      mutationFn: ({ id, body }: { id?: string; body: Partial<LeaveTypeDef> }) =>
        id ? api(`leave-policy/types/${id}`, { method: "PUT", body }) : api("leave-policy/types", { method: "POST", body }),
      onSuccess: refresh,
    }),
    credit: useMutation({
      mutationFn: (b: { employeeId: string; leaveTypeId: string; days: number; note: string; kind: "opening" | "adjustment" | "encash" }) =>
        api("leave-policy/credit", { method: "POST", body: b }),
      onSuccess: refresh,
    }),
    opening: useMutation({
      mutationFn: (b: { rows: { employeeCode: string; type: string; days: number }[]; note?: string }) =>
        api<Envelope<{ saved: number; problems: string[]; problemCount: number }>>("leave-policy/opening", { method: "POST", body: b }),
      onSuccess: refresh,
    }),
    closeYear: useMutation({
      mutationFn: (year: number) => api<Envelope<{ year: number; carried: number; lapsed: number; alreadyClosed: number }>>("leave-policy/close-year", { method: "POST", body: { year } }),
      onSuccess: refresh,
    }),
  };
}

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
