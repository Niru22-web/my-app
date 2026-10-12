"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { AccountsDashboard, AttendanceToday, CombinedDashboard, ComplianceDashboard, Envelope } from "@/lib/types";

// Same 30s refresh the legacy dashboard used, paused while the tab is hidden.
const LIVE = { refetchInterval: 30_000, refetchIntervalInBackground: false } as const;

export function useCombinedDashboard() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["dashboard", "combined", user?.id],
    queryFn: async () => (await api<Envelope<CombinedDashboard>>("dashboard/combined")).data,
    enabled: !!user,
    ...LIVE,
  });
}

export function useAttendanceToday() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["attendance", "today", user?.id],
    queryFn: async () => (await api<Envelope<AttendanceToday>>("attendance/today")).data,
    enabled: !!user,
    ...LIVE,
  });
}

export function useCompliance(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["compliance", "dashboard", user?.id],
    queryFn: async () => (await api<Envelope<ComplianceDashboard>>("compliance/dashboard")).data,
    enabled: !!user && enabled,
    ...LIVE,
  });
}

export function useAccountsDashboard(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["accounts", "dashboard", user?.id],
    queryFn: async () => (await api<Envelope<AccountsDashboard>>("accounts/dashboard")).data,
    enabled: !!user && enabled,
    staleTime: 60_000,
  });
}

/** The API formats event dates as "Oct 9" (en-US). Split them reliably into day + month. */
export function splitShortDate(s: string): { day: string; month: string } {
  const m = s.match(/^([A-Za-z]{3})\s+(\d{1,2})$/);
  if (m) return { month: m[1], day: m[2] };
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return { day: String(d.getDate()), month: d.toLocaleDateString("en-IN", { month: "short" }) };
  return { day: s, month: "" };
}
