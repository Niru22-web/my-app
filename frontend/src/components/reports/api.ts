"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Envelope } from "@/lib/types";

export type Tier = "my" | "team" | "org";
export type Category = "employee" | "leave" | "attendance" | "time";
export type Param = "range" | "date" | "month" | "client" | "project";
export type Fmt = "text" | "number" | "hours" | "percent" | "date" | "currency" | "badge";

export const TIER_META: Record<Tier, { label: string; href: string; blurb: string }> = {
  my: { label: "My Reports", href: "/reports/my", blurb: "Your own leave, attendance and time." },
  team: { label: "Team Reports", href: "/reports/team", blurb: "Everyone who reports to you, directly or further down." },
  org: { label: "Organization Reports", href: "/reports/org", blurb: "The whole firm." },
};

export interface CatalogReport {
  key: string;
  category: Category;
  title: string;
  description: string;
  tiers: Tier[];
  params: Param[];
}
export interface Catalog {
  access: Record<Tier, boolean>;
  categories: { key: Category; title: string }[];
  reports: CatalogReport[];
}

export interface Kpi { label: string; value: number | string; format?: Fmt; hint?: string; tone?: "good" | "warn" | "bad" }
export interface Chart {
  type: "bar" | "stacked" | "line" | "pie";
  title: string;
  xKey: string;
  series: { key: string; label: string }[];
  data: Record<string, string | number>[];
}
export interface Column { key: string; label: string; format?: Fmt; align?: "right" }
export type Row = Record<string, string | number | null>;
export interface ReportResult {
  kpis: Kpi[];
  charts: Chart[];
  columns: Column[];
  rows: Row[];
  notes?: string[];
  period?: string;
  meta: { key: string; tier: Tier; title: string; description: string; from: string; to: string; people: number; generatedAt: string };
}

export function useReportCatalog() {
  return useQuery({
    queryKey: ["reports", "catalog"],
    queryFn: () => api<Envelope<Catalog>>("reports/catalog").then((r) => r.data),
    staleTime: 5 * 60_000,
  });
}

export interface RunParams { from?: string; to?: string; date?: string; month?: string; clientId?: string; projectId?: string }

export function useReport(tier: Tier, key: string, params: RunParams, enabled = true) {
  return useQuery({
    queryKey: ["reports", tier, key, params],
    queryFn: () => api<Envelope<ReportResult>>(`reports/${tier}/${key}`, { query: { ...params } }).then((r) => r.data),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useFilterOptions(needsClients: boolean, needsProjects: boolean) {
  const clients = useQuery({
    queryKey: ["reports", "opt", "clients"],
    queryFn: () => api<Envelope<{ id: string; name: string; status: string }[]>>("clients").then((r) => r.data),
    enabled: needsClients,
    staleTime: 5 * 60_000,
  });
  const projects = useQuery({
    queryKey: ["reports", "opt", "projects"],
    queryFn: () => api<Envelope<{ id: string; name: string; clientId: string }[]>>("projects").then((r) => r.data),
    enabled: needsProjects,
    staleTime: 5 * 60_000,
  });
  return { clients: clients.data ?? [], projects: projects.data ?? [] };
}

export const favKey = (userId: string | undefined) => `reports:favourites:${userId ?? "anon"}`;
