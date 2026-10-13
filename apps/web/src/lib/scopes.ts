"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Envelope } from "@/lib/types";

/**
 * My / Team / Organization — the same three views in Timesheet, Attendance, Leave and Reports.
 * The API decides access (team = anyone with people reporting to them; org = Admin, Owner, HR, IT,
 * Accounts or the Analytics permission) and scopes every list server-side.
 */
export type Scope = "my" | "team" | "org";
export type ScopeAccess = Record<Scope, boolean>;

export function useScopes() {
  return useQuery({
    queryKey: ["scopes"],
    queryFn: () => api<Envelope<ScopeAccess>>("scopes").then((r) => r.data),
    staleTime: 5 * 60_000,
  });
}

export interface ScopePerson {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  designation: string;
  status: string;
}

export function useScopePeople(scope: Scope, enabled = true) {
  return useQuery({
    queryKey: ["scopes", scope, "people"],
    queryFn: () => api<Envelope<ScopePerson[]>>(`scopes/${scope}/people`).then((r) => r.data ?? []),
    enabled: enabled && scope !== "my",
    staleTime: 5 * 60_000,
  });
}

export const SCOPE_TEXT: Record<Exclude<Scope, "my">, string> = {
  team: "Everyone who reports to you, directly or through their managers.",
  org: "Everyone in the firm.",
};
