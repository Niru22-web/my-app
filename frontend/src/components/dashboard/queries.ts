"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { AttendanceToday, CombinedDashboard, ComplianceDashboard, Envelope } from "@/lib/types";

// Refresh every 2 minutes while the tab is visible, and as soon as the person comes back to the tab. The
// person's own actions (punching in, submitting time, approving) invalidate these straight away anyway.
const LIVE = { staleTime: 60_000, refetchInterval: 120_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true } as const;

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

/** The API formats event dates as "Oct 9" (en-US). Split them reliably into day + month. */
export function splitShortDate(s: string): { day: string; month: string } {
  const m = s.match(/^([A-Za-z]{3})\s+(\d{1,2})$/);
  if (m) return { month: m[1], day: m[2] };
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return { day: String(d.getDate()), month: d.toLocaleDateString("en-IN", { month: "short" }) };
  return { day: s, month: "" };
}
