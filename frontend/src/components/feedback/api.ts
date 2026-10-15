"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { normRole } from "@/lib/roles";

export type FeedbackCategory = "Idea" | "Problem" | "Praise" | "Question" | "Other";
export type FeedbackStatus = "NEW" | "REVIEWED" | "PLANNED" | "DONE" | "CLOSED";

export interface Feedback {
  id: string;
  category: FeedbackCategory;
  rating: number | null;
  message: string;
  module: string | null;
  pageUrl: string | null;
  anonymous: boolean;
  status: FeedbackStatus;
  response: string | null;
  respondedAt: string | null;
  respondedBy: string | null;
  bugId: string | null;
  createdAt: string;
  updatedAt: string;
  mine: boolean;
  employeeId: string | null;
  sender: { id: string; name: string; department: string | null } | null;
}

export interface FeedbackSummary {
  total: number;
  counts: Record<FeedbackStatus, number>;
  averageRating: number | null;
  rated: number;
  convertedToBugs: number;
}

export interface FeedbackInput {
  category: FeedbackCategory;
  rating?: number | null;
  message: string;
  module?: string;
  pageUrl?: string;
  anonymous?: boolean;
}

export const CATEGORIES: FeedbackCategory[] = ["Idea", "Problem", "Praise", "Question", "Other"];
export const STATUSES: FeedbackStatus[] = ["NEW", "REVIEWED", "PLANNED", "DONE", "CLOSED"];
export const STATUS_LABEL: Record<FeedbackStatus, string> = { NEW: "New", REVIEWED: "Reviewed", PLANNED: "Planned", DONE: "Done", CLOSED: "Closed" };
export const STATUS_TONE: Record<FeedbackStatus, "brand" | "neutral" | "success" | "warning" | "danger"> = {
  NEW: "brand",
  REVIEWED: "warning",
  PLANNED: "warning",
  DONE: "success",
  CLOSED: "neutral",
};
export const CATEGORY_HINT: Record<FeedbackCategory, string> = {
  Idea: "Something that would make the portal better",
  Problem: "Something isn’t working as it should",
  Praise: "Something you like",
  Question: "Something you’d like to know",
  Other: "Anything else",
};

export const MODULES = [
  "Dashboard",
  "Timesheet",
  "Attendance",
  "Leave",
  "Expense claims",
  "My Portal",
  "Reports",
  "Accounts",
  "Help desk",
  "Assets",
  "Management",
  "Compliance",
  "Inbox",
  "Calendar",
  "Announcements",
  "Administration",
  "What’s new",
  "Other",
];

/** Best guess of the portal module from the current path. */
export function guessModule(pathname: string): string {
  const p = pathname.toLowerCase();
  const map: [string, string][] = [
    ["/timesheet", "Timesheet"],
    ["/attendance", "Attendance"],
    ["/leave", "Leave"],
    ["/portal/reimbursements", "Expense claims"],
    ["/portal", "My Portal"],
    ["/reports", "Reports"],
    ["/accounts", "Accounts"],
    ["/help-desk", "Help desk"],
    ["/admin/asset-management", "Assets"],
    ["/management", "Management"],
    ["/compliance", "Compliance"],
    ["/inbox", "Inbox"],
    ["/calendar", "Calendar"],
    ["/announcements", "Announcements"],
    ["/admin-portal", "Administration"],
    ["/releases", "What’s new"],
    ["/dashboard", "Dashboard"],
  ];
  return map.find(([k]) => p === k || p.startsWith(k + "/"))?.[1] ?? "";
}

export const isFeedbackReviewer = (role?: string | null) => ["admin", "owner", "it", "hr"].includes(normRole(role));

export function useFeedback(scope: "mine" | "all", enabled = true) {
  return useQuery({
    queryKey: ["feedback", scope],
    enabled,
    queryFn: () =>
      api<{ data: Feedback[]; summary: FeedbackSummary; reviewer: boolean; canReview: boolean }>("feedback", { query: { mine: scope === "mine" ? 1 : undefined } }),
  });
}

export function useFeedbackMutations() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ["feedback"] });
  type One = { data: Feedback; message?: string };
  return {
    send: useMutation({ mutationFn: (body: FeedbackInput) => api<One>("feedback", { method: "POST", body }), onSuccess: done }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: { status?: FeedbackStatus; response?: string } }) => api<One>(`feedback/${id}`, { method: "PATCH", body }),
      onSuccess: done,
    }),
    toBug: useMutation({
      mutationFn: (id: string) => api<One & { bug: { id: string; code: string | null } }>(`feedback/${id}/convert-to-bug`, { method: "POST" }),
      onSuccess: done,
    }),
    remove: useMutation({ mutationFn: (id: string) => api<{ message?: string }>(`feedback/${id}`, { method: "DELETE" }), onSuccess: done }),
  };
}
