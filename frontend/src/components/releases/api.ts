"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { normRole } from "@/lib/roles";

// ---- Shapes (GET /api/releases) ---------------------------------------------------------

export type ItemType = "New" | "Improved" | "Changed" | "Fixed";
export type ReleaseTag = "feature" | "fix" | "improvement" | "security";

export interface ReleaseItem {
  type: ItemType;
  text: string;
}
export interface ReleaseSection {
  module: string;
  items: ReleaseItem[];
}
export interface Release {
  id: string;
  version: string;
  title: string;
  summary: string | null;
  tags: ReleaseTag[];
  sections: ReleaseSection[];
  status: "DRAFT" | "PUBLISHED";
  publishedAt: string | null;
  createdById: string;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface ReleaseInput {
  version: string;
  title: string;
  summary: string;
  tags: ReleaseTag[];
  sections: ReleaseSection[];
}

// ---- Vocabulary --------------------------------------------------------------------------

export const ITEM_TYPES: ItemType[] = ["New", "Improved", "Changed", "Fixed"];
export const TAGS: ReleaseTag[] = ["feature", "fix", "improvement", "security"];
export const VERSION_RE = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/;

/** Portal modules offered in the editor (free text is allowed too). */
export const PORTAL_MODULES = [
  "Accounts & Finance",
  "Timesheets",
  "Attendance",
  "Leave",
  "Expense claims",
  "Help desk",
  "Assets",
  "Management",
  "Compliance",
  "Dashboards",
  "Reports",
  "Inbox",
  "Calendar",
  "Announcements",
  "My Portal",
  "Administration",
  "Bug tracker",
  "Feedback",
  "Security",
  "General",
];

export const TYPE_STYLE: Record<ItemType, string> = {
  New: "bg-brand text-brand-ink",
  Improved: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-200",
  Changed: "bg-[#0b1f45] text-white dark:bg-[#22345a] dark:text-[#dbe5f5]",
  Fixed: "bg-success-soft text-success",
};
export const TAG_STYLE: Record<ReleaseTag, string> = {
  feature: "bg-brand-soft text-brand border border-brand/20",
  fix: "bg-success-soft text-success border border-success/20",
  improvement: "bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-200 dark:border-indigo-400/30",
  security: "bg-warning-soft text-warning border border-warning/25",
};

export const canManageReleases = (role?: string | null) => ["admin", "owner", "it"].includes(normRole(role));

export const itemCount = (r: Pick<Release, "sections">) => r.sections.reduce((n, s) => n + s.items.length, 0);

// ---- Hooks -------------------------------------------------------------------------------

export function useReleases(all: boolean) {
  return useQuery({
    queryKey: ["releases", all ? "all" : "published"],
    queryFn: () => api<{ data: Release[]; canManage: boolean }>("releases", { query: { all: all ? 1 : undefined } }),
  });
}

export function useRelease(id: string | undefined) {
  return useQuery({
    queryKey: ["release", id],
    enabled: !!id,
    queryFn: async () => (await api<{ data: Release }>(`releases/${encodeURIComponent(id!)}`)).data,
  });
}

export function useReleaseMutations() {
  const qc = useQueryClient();
  const done = () => {
    qc.invalidateQueries({ queryKey: ["releases"] });
    qc.invalidateQueries({ queryKey: ["release"] });
    qc.invalidateQueries({ queryKey: ["releases-unseen"] });
  };
  type Msg = { data: Release; message?: string };
  return {
    create: useMutation({ mutationFn: (body: ReleaseInput) => api<Msg>("releases", { method: "POST", body }), onSuccess: done }),
    update: useMutation({ mutationFn: ({ id, body }: { id: string; body: Partial<ReleaseInput> }) => api<Msg>(`releases/${id}`, { method: "PUT", body }), onSuccess: done }),
    publish: useMutation({ mutationFn: (id: string) => api<Msg>(`releases/${id}/publish`, { method: "POST" }), onSuccess: done }),
    unpublish: useMutation({ mutationFn: (id: string) => api<Msg>(`releases/${id}/unpublish`, { method: "POST" }), onSuccess: done }),
    remove: useMutation({ mutationFn: (id: string) => api<{ message?: string }>(`releases/${id}`, { method: "DELETE" }), onSuccess: done }),
  };
}
