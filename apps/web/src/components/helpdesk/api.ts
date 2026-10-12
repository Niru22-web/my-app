"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { normRole } from "@/lib/roles";
import type { Envelope } from "@/lib/types";

// ---- Shapes (GET /api/tickets, /api/helpdesk/categories) -------------------------------

export interface TicketAttachment {
  id: string;
  url: string;
  filename: string;
  size: number;
  mimeType: string;
  createdAt: string;
}

export interface TicketEvent {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  fromAssignee: string | null;
  toAssignee: string | null;
  performedById: string;
  performedAt: string;
  remarks: string | null;
  performer?: { firstName: string; lastName: string } | null;
  attachments?: TicketAttachment[];
}

/** Raw category row as embedded on tickets (snake_case from the database). */
interface RawCategory {
  id: number;
  category_name: string;
  sla_hours: number | null;
  assigned_team: string | null;
}

export interface Ticket {
  id: string;
  ticketId: string | null;
  title: string;
  description: string;
  status: string;
  priority: string | null;
  category: string | null;
  categoryId: number | null;
  subcategoryId: number | null;
  assignedTo: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; firstName: string; lastName: string; employeeId: string; department: string | null } | null;
  categoryRel?: RawCategory | null;
  subcategoryRel?: RawCategory | null;
  attachments?: TicketAttachment[];
  history?: TicketEvent[];
  assigneeName?: string | null;
}

export interface Category {
  id: number;
  categoryName: string;
  description: string | null;
  isActive: boolean;
  displayOrder: number;
  parentId: number | null;
  assignedTeam: string | null;
  slaHours: number | null;
  supportEmail: string | null;
  ccEmail: string | null;
  escalationEmail: string | null;
  autoAssignUserId: string | null;
  children?: Category[];
}

// ---- Vocabulary -------------------------------------------------------------------------

export const STATUSES = ["Open", "In Progress", "Resolved", "Returned"] as const;
export const PRIORITIES = ["High", "Medium", "Low"] as const;
export const TEAMS = ["IT", "HR", "Finance", "Admin", "Accounts"] as const;

export type StatusKey = "open" | "progress" | "resolved" | "returned" | "closed";
export function statusKey(s?: string | null): StatusKey {
  const v = (s ?? "").toLowerCase();
  if (v === "in progress") return "progress";
  if (v === "resolved") return "resolved";
  if (v === "returned") return "returned";
  if (v === "closed") return "closed";
  return "open";
}
export const STATUS_TONE: Record<StatusKey, "brand" | "warning" | "success" | "danger" | "neutral"> = {
  open: "brand",
  progress: "warning",
  resolved: "success",
  returned: "danger",
  closed: "neutral",
};
export const PRIORITY_TONE: Record<string, "danger" | "warning" | "neutral"> = { High: "danger", Medium: "warning", Low: "neutral" };

/**
 * Support agents. Deliberately narrower than the API's `role.includes("it")` (which also matches
 * "Auditor", "Recruiter"…): only Admin, IT and roles containing "support" get agent tools.
 */
export function isSupportAgent(role?: string | null) {
  const r = normRole(role);
  return r === "admin" || r === "it" || r.includes("support");
}
export const isCategoryAdmin = (role?: string | null) => normRole(role) === "admin";
export const seesTeamTickets = (role?: string | null) => ["manager", "partner"].includes(normRole(role));

export function ticketCode(t: Pick<Ticket, "ticketId" | "id">) {
  return t.ticketId ?? `TKT-${t.id.slice(0, 6).toUpperCase()}`;
}
export function raiserName(t: Ticket) {
  return t.createdBy ? `${t.createdBy.firstName} ${t.createdBy.lastName}`.trim() : "—";
}
export function categoryLabel(t: Ticket) {
  const p = t.categoryRel?.category_name;
  const s = t.subcategoryRel?.category_name;
  return p && s ? `${p} › ${s}` : p || s || t.category || "General";
}
/** Response target in hours: subcategory, then category, then the API default of 24. */
export function slaHours(t: Ticket) {
  return t.subcategoryRel?.sla_hours ?? t.categoryRel?.sla_hours ?? 24;
}
export function slaState(t: Ticket, now = Date.now()) {
  const due = new Date(t.createdAt).getTime() + slaHours(t) * 3_600_000;
  const done = ["resolved", "closed"].includes(statusKey(t.status));
  return { due: new Date(due), overdue: !done && now > due, remainingMs: due - now, done };
}

// ---- Queries -----------------------------------------------------------------------------

export function useTickets() {
  return useQuery({
    queryKey: ["tickets"],
    queryFn: async () => (await api<Envelope<Ticket[]>>("tickets")).data ?? [],
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

export function useTicket(id: string) {
  return useQuery({
    queryKey: ["tickets", id],
    queryFn: async () => (await api<Envelope<Ticket>>(`tickets/${id}`)).data,
  });
}

export function useCategoryTree(activeOnly = true) {
  return useQuery({
    queryKey: ["helpdesk", "categories", activeOnly ? "tree" : "all"],
    queryFn: async () => (await api<Envelope<Category[]>>(activeOnly ? "helpdesk/categories/tree" : "helpdesk/categories")).data ?? [],
    staleTime: 5 * 60_000,
  });
}

// ---- Mutations -----------------------------------------------------------------------------

export function useTicketMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["tickets"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  return {
    create: useMutation({
      mutationFn: (fd: FormData) => api<Envelope<Ticket & { assignedTeam?: string; slaHours?: number }>>("tickets", { method: "POST", body: fd }),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: { status?: string; assignedTo?: string | null } }) => api(`tickets/${id}`, { method: "PATCH", body }),
      onSuccess: refresh,
    }),
    addEvent: useMutation({
      mutationFn: ({ id, fd }: { id: string; fd: FormData }) => api(`tickets/${id}/history`, { method: "POST", body: fd }),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: (id: string) => api(`tickets/${id}`, { method: "DELETE" }), onSuccess: refresh }),
  };
}

export function useCategoryMutations() {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: ["helpdesk", "categories"] });
  return {
    save: useMutation({
      mutationFn: ({ id, body }: { id?: number; body: Record<string, unknown> }) => api(id ? `helpdesk/categories/${id}` : "helpdesk/categories", { method: id ? "PUT" : "POST", body }),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: (id: number) => api(`helpdesk/categories/${id}`, { method: "DELETE" }), onSuccess: refresh }),
  };
}

/** File types accepted for ticket attachments. HTML/SVG are excluded: the server would serve them on the app's own domain. */
export const ATTACH_ACCEPT = ".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.ppt,.pptx,.zip,.mp4,.mov";
