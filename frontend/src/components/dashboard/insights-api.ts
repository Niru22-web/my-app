"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Envelope } from "@/lib/types";

export type Period = "month" | "last-month" | "quarter" | "fy";
export const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "quarter", label: "This quarter" },
  { value: "fy", label: "This FY" },
];

export interface TodayAttendance {
  present: number;
  late: number;
  onLeave: number;
  notIn: number;
  offDay: boolean;
  holiday: string | null;
  lateList: { name: string; minutes: number }[];
  leaveList: string[];
}
export interface WeekCompliance {
  week: { from: string; to: string };
  compliant: number;
  partial: number;
  none: number;
  total: number;
  shortfall: { id: string; name: string; hours: number; expected: number; pct: number }[];
}
export interface PartnerInsights {
  lead: { id: string; name: string; role: string; designation: string | null };
  period: { key: Period; from: string; to: string; label: string };
  team: { size: number; today: TodayAttendance; compliance: WeekCompliance; upcomingLeave: { name: string; from: string; to: string; type: string; days: number }[] };
  queue: { leaves: number; claims: number; timesheets: number; corrections: number } | null;
  work: {
    hours: number;
    billableHours: number;
    billablePct: number | null;
    clients: number;
    engagedClients: number;
    activeProjects: number;
    byClient: { id: string; name: string; hours: number; billable: number }[];
    byPerson: { id: string; name: string; designation: string | null; hours: number; billable: number }[];
    trend: { week: string; billable: number; nonBillable: number }[];
    overdueProjects: { id: string; name: string; code: string; client: string; endDate: string | null }[];
  };
  receivables: { outstanding: number; overdue: number; invoices: number };
}
export interface HrInsights {
  headcount: {
    active: number;
    invited: number;
    pendingApproval: number;
    joinedLast30: number;
    byDepartment: { name: string; count: number }[];
    byDesignation: { name: string; count: number }[];
    missingProfile: number;
  };
  movement: { months: { month: string; joiners: number; leavers: number }[]; leftThisFy: number; exitsInProgress: number; leavingIn30: number; exits: { name: string; type: string; lastDay: string; inDays: number }[] };
  today: TodayAttendance;
  leave: { pending: number; upcoming7: number; negative: number };
  corrections: number;
  documents: { missingPeople: number; awaiting: number; complete: number; requirements: number } | null;
  compliance: WeekCompliance;
  celebrations: { name: string; kind: "Birthday" | "Work anniversary"; inDays: number; years?: number; date: string }[];
}

const LIVE = { refetchInterval: 120_000, refetchIntervalInBackground: false } as const;

export function usePartnerInsights(partnerId: string | undefined, period: Period) {
  return useQuery({
    queryKey: ["dashboard", "partner", partnerId ?? "me", period],
    queryFn: async () => (await api<Envelope<PartnerInsights>>("insights/partner", { query: { partnerId, period } })).data,
    ...LIVE,
  });
}

export function usePartnerList(enabled: boolean) {
  return useQuery({
    queryKey: ["dashboard", "partners"],
    queryFn: async () => (await api<Envelope<{ id: string; name: string; role: string }[]>>("insights/partners")).data ?? [],
    enabled,
    staleTime: 10 * 60_000,
  });
}

/** `enabled` = false for roles the API refuses (it serves HR, Admin and Owner only) — no request is sent. */
export function useHrInsights(enabled = true) {
  return useQuery({
    queryKey: ["dashboard", "hr"],
    queryFn: async () => (await api<Envelope<HrInsights>>("insights/hr")).data,
    enabled,
    ...LIVE,
  });
}
