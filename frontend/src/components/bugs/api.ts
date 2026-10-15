"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { normRole } from "@/lib/roles";
import type { Envelope } from "@/lib/types";

// ---- Vocabulary (matches backend/src/modules/bugs.routes.ts) ---------------------------------

export const BUG_TYPES = ["Bug", "Feature", "Enhancement"] as const;
export const BUG_MODULES = [
  "Dashboard", "Timesheet", "Attendance", "Leave", "Expense claims", "Help desk", "Accounts", "Assets",
  "Management", "Reports", "Announcements", "Administration", "Other",
] as const;
export const BUG_PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;
export const BUG_STATUSES = ["Open", "In Progress", "Pending Discussion", "Ready to Test", "Resolved", "Reopened", "Not a Bug"] as const;
export const BUG_ENVIRONMENTS = ["UAT", "Live"] as const;
export const CLOSED_STATUSES = new Set<string>(["Resolved", "Not a Bug"]);
export const BUG_ATTACH_ACCEPT = ".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.log,.csv,.xlsx,.docx";

/** Fixed colour per status (charts, dots, board columns). */
export const STATUS_COLOR: Record<string, string> = {
  Open: "var(--series-1)",
  "In Progress": "var(--series-4)",
  "Pending Discussion": "var(--series-7)",
  "Ready to Test": "var(--series-5)",
  Resolved: "var(--series-3)",
  Reopened: "var(--series-2)",
  "Not a Bug": "var(--chart-previous)",
};
export const PRIORITY_TONE: Record<string, "danger" | "warning" | "brand" | "neutral"> = { Critical: "danger", High: "warning", Medium: "brand", Low: "neutral" };

export const isTriage = (role?: string | null) => ["admin", "owner", "it"].includes(normRole(role));
export const isOpenish = (status: string) => !CLOSED_STATUSES.has(status);

// ---- Shapes -----------------------------------------------------------------------------

export interface BugPerson {
  id: string;
  name: string;
  employeeId: string;
  role: string;
  designation: string | null;
  profileImage: string | null;
}
export interface BugFile {
  path: string;
  name: string;
  size: number;
  mimeType: string;
}
export interface BugEvent {
  id: string;
  bugId: string;
  bugCode: string | null;
  bugTitle: string | null;
  environment: string | null;
  kind: "comment" | "created" | "status" | "assign" | "priority" | "edit" | "due" | string;
  body: string | null;
  fromValue: string | null;
  toValue: string | null;
  fromLabel: string | null;
  toLabel: string | null;
  files: BugFile[];
  createdAt: string;
  actor: { id: string; name: string; role: string; profileImage: string | null };
}
export interface Bug {
  id: string;
  code: string;
  title: string;
  description: string;
  type: string;
  module: string | null;
  priority: string;
  status: string;
  environment: string;
  pageUrl: string | null;
  externalRef: string | null;
  reporterId: string;
  assigneeId: string | null;
  dueDate: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  reporter: BugPerson | null;
  assignee: BugPerson | null;
  commentCount: number;
  isPastDue: boolean;
  allowedStatuses: string[];
  canDelete: boolean;
}
export interface BugPermissions {
  canTriage: boolean;
  canEdit: boolean;
  statuses: string[];
  canReopen: boolean;
  canDelete: boolean;
}
export interface BugDetail extends Bug {
  events: BugEvent[];
  permissions: BugPermissions;
}
export interface BugCounts {
  all: number;
  byStatus: Record<string, number>;
  openish: number;
  unassigned: number;
  pastDue: number;
  mine: number;
  reportedByMe: number;
  critical: number;
}
export interface BugSummary {
  totals: { all: number; open: number; pendingDiscussion: number; resolved: number };
  deltas: Record<"all" | "open" | "pendingDiscussion" | "resolved", { current: number; previous: number }>;
  byStatus: { status: string; count: number }[];
  daily: { date: string; count: number }[];
  newLast14: number;
  unassigned: number;
  pastDue: number;
  mine: number;
  recent: BugEvent[];
}
export interface ActivityPage {
  success: boolean;
  data: BugEvent[];
  total: number;
  page: number;
  limit: number;
  people: { id: string; name: string }[];
}

export type BugQuery = Partial<Record<"status" | "type" | "priority" | "module" | "environment" | "assignee" | "reporter" | "q" | "field" | "from" | "to" | "open" | "pastDue", string>>;

// ---- Queries ----------------------------------------------------------------------------

export function useBugs(query: BugQuery) {
  return useQuery({
    queryKey: ["bugs", "list", query],
    queryFn: () => api<{ success: boolean; data: Bug[]; counts: BugCounts }>("bugs", { query }),
    placeholderData: keepPreviousData,
  });
}
export function useBugSummary() {
  return useQuery({ queryKey: ["bugs", "summary"], queryFn: () => api<Envelope<BugSummary>>("bugs/summary").then((r) => r.data) });
}
export function useBug(id: string) {
  return useQuery({ queryKey: ["bugs", "one", id], queryFn: () => api<Envelope<BugDetail>>(`bugs/${id}`).then((r) => r.data), retry: (n, e) => (e as { status?: number }).status !== 404 && n < 2 });
}
export function useBugAssignees(enabled = true) {
  return useQuery({ queryKey: ["bugs", "assignees"], queryFn: () => api<Envelope<BugPerson[]>>("bugs/assignees").then((r) => r.data), enabled, staleTime: 60_000 });
}
export function useBugActivity(query: { page: number; limit: number; kind?: string; actor?: string }) {
  return useQuery({ queryKey: ["bugs", "activity", query], queryFn: () => api<ActivityPage>("bugs/activity", { query }), placeholderData: keepPreviousData });
}

export interface BugPatch {
  title?: string;
  description?: string;
  module?: string | null;
  type?: string;
  status?: string;
  comment?: string;
  assigneeId?: string | null;
  priority?: string;
  dueDate?: string | null;
  environment?: string;
  externalRef?: string | null;
}

export function useBugMutations() {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: ["bugs"] });
  return {
    create: useMutation({
      mutationFn: (body: FormData) => api<Envelope<{ id: string; code: string }>>("bugs", { method: "POST", body }).then((r) => r.data),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: BugPatch }) => api<Envelope<BugDetail>>(`bugs/${id}`, { method: "PATCH", body }).then((r) => r.data),
      onSuccess: refresh,
    }),
    comment: useMutation({
      mutationFn: ({ id, fd }: { id: string; fd: FormData }) => api<Envelope<BugEvent>>(`bugs/${id}/comments`, { method: "POST", body: fd }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api(`bugs/${id}`, { method: "DELETE" }),
      onSuccess: refresh,
    }),
  };
}

// ---- Helpers ----------------------------------------------------------------------------

/** "1d 5h" / "3h 20m" */
export function fmtDuration(ms: number) {
  const h = Math.floor(Math.abs(ms) / 3_600_000);
  const m = Math.floor((Math.abs(ms) % 3_600_000) / 60_000);
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${m}m`;
}

/** Plain-language sentence for an event, without the actor's name. */
export function eventSentence(e: BugEvent, opts: { withCode?: boolean } = {}) {
  const code = opts.withCode && e.bugCode ? e.bugCode : "it";
  const codeOr = (fallback: string) => (opts.withCode && e.bugCode ? e.bugCode : fallback);
  switch (e.kind) {
    case "created":
      return `created ${codeOr("the ticket")}`;
    case "comment":
      return e.body ? `commented on ${codeOr("the ticket")}: “${e.body}”` : `attached ${e.files.length === 1 ? "a file" : `${e.files.length} files`} to ${codeOr("the ticket")}`;
    case "status":
      return `moved ${code} from ${e.fromValue ?? "—"} to ${e.toValue ?? "—"}`;
    case "assign":
      return e.toValue ? `assigned ${code} to ${e.toLabel}` : `unassigned ${code}`;
    case "priority":
      return `changed the priority of ${code} from ${e.fromValue} to ${e.toValue}`;
    case "due":
      return e.toValue ? `set the due date of ${code} to ${new Date(e.toValue).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : `cleared the due date of ${code}`;
    case "edit":
      if (e.body === "description") return `edited the description of ${code}`;
      return `changed the ${e.body ?? "details"} of ${code}${e.toValue ? ` to “${e.toValue}”` : e.fromValue ? " (cleared)" : ""}`;
    default:
      return `updated ${code}`;
  }
}

export const KIND_LABEL: Record<string, string> = {
  created: "Created",
  comment: "Comments",
  status: "Status changes",
  assign: "Assignments",
  priority: "Priority changes",
  due: "Due date changes",
  edit: "Edits",
};
