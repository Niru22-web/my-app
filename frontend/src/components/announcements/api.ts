"use client";

import { useQuery } from "@tanstack/react-query";
import { Cake, CalendarDays, Gift, Megaphone, PartyPopper, ScrollText, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import { normRole } from "@/lib/roles";
import type { Envelope } from "@/lib/types";

// ---- Shapes (GET /api/announcements…) ---------------------------------------------------

export const CATEGORIES = ["Announcement", "Policy", "Event", "Festival", "Birthday", "Anniversary"] as const;
export type Category = (typeof CATEGORIES)[number];
export type Status = "DRAFT" | "SCHEDULED" | "SENT" | "CANCELLED";
export type WishKind = "BIRTHDAY" | "ANNIVERSARY" | "FESTIVAL";
export const THEMES = ["classic", "confetti", "diya", "floral"] as const;
export type Theme = (typeof THEMES)[number];

export interface Audience {
  departments?: string[];
  designations?: string[];
  roles?: string[];
  locations?: string[];
  employeeIds?: string[];
}

export interface Announcement {
  id: string;
  title: string;
  message: string;
  category: Category;
  audience: Audience | null;
  pinned: boolean;
  status: Status;
  scheduledAt: string | null;
  sentAt: string | null;
  expiresAt: string | null;
  templateId: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  recipientIds?: string[];
  recipientCount: number;
  readCount?: number;
  sender: { name: string; designation: string | null; profileImage: string | null };
  theme: Theme | null;
  isRecipient: boolean;
  read: boolean;
  readAt: string | null;
  expired: boolean;
}

export interface AudienceOptions {
  departments: string[];
  designations: string[];
  roles: string[];
  locations: string[];
  people: { id: string; name: string; sub: string; employeeId: string }[];
  totalActive: number;
}

export interface AudiencePreview {
  everyone: boolean;
  count: number;
  totalActive: number;
  names: string[];
}

export interface WishTemplate {
  id: string;
  kind: WishKind;
  name: string;
  title: string;
  message: string;
  festivalOn: string | null;
  autoSend: boolean;
  isActive: boolean;
  theme: Theme;
  createdAt: string;
  updatedAt: string;
}

export interface WishPerson {
  id: string;
  employeeId: string;
  name: string;
  firstName: string;
  department: string;
  designation: string;
  profileImage: string | null;
}

interface SentInfo {
  sent: boolean;
  announcementId: string | null;
  sentAt: string | null;
  auto: boolean;
}

export interface WishesToday {
  date: string;
  birthdays: (SentInfo & { person: WishPerson })[];
  anniversaries: (SentInfo & { person: WishPerson; years: number })[];
  festivals: (SentInfo & { template: WishTemplate })[];
  upcoming: { date: string; kind: WishKind; person?: WishPerson; years?: number; festival?: { id: string; name: string } }[];
  missingDates: number;
}

// ---- Access -----------------------------------------------------------------------------

export const canManageAnnouncements = (role?: string | null) => ["admin", "owner", "hr"].includes(normRole(role));

// ---- Queries ----------------------------------------------------------------------------

export const KEYS = {
  feed: ["announcements", "feed"] as const,
  manage: ["announcements", "manage"] as const,
  banner: ["announcements", "banner"] as const,
  options: ["announcements", "audience-options"] as const,
  templates: ["announcements", "templates"] as const,
  wishes: ["announcements", "wishes"] as const,
};

export function useFeed() {
  return useQuery({
    queryKey: KEYS.feed,
    queryFn: async () => (await api<Envelope<Announcement[]>>("announcements", { query: { mine: "true" } })).data,
  });
}

export function useManageList(enabled: boolean) {
  return useQuery({
    queryKey: KEYS.manage,
    enabled,
    queryFn: async () => (await api<Envelope<Announcement[]>>("announcements")).data,
  });
}

export function useAudienceOptions(enabled = true) {
  return useQuery({
    queryKey: KEYS.options,
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => (await api<Envelope<AudienceOptions>>("announcements/audience-options")).data,
  });
}

export function useTemplates(enabled = true) {
  return useQuery({
    queryKey: KEYS.templates,
    enabled,
    queryFn: async () => (await api<Envelope<WishTemplate[]>>("announcements/templates")).data,
  });
}

export function useWishesToday(enabled = true) {
  return useQuery({
    queryKey: KEYS.wishes,
    enabled,
    queryFn: async () => (await api<Envelope<WishesToday>>("announcements/wishes/today")).data,
  });
}

// ---- Display helpers --------------------------------------------------------------------

export const CATEGORY_META: Record<Category, { icon: LucideIcon; chip: string }> = {
  Announcement: { icon: Megaphone, chip: "bg-brand-soft text-brand" },
  Policy: { icon: ScrollText, chip: "bg-surface-muted text-ink-muted border border-line" },
  Event: { icon: CalendarDays, chip: "bg-success-soft text-success" },
  Festival: { icon: PartyPopper, chip: "bg-warning-soft text-warning" },
  Birthday: { icon: Cake, chip: "bg-danger-soft text-danger" },
  Anniversary: { icon: Gift, chip: "bg-brand-soft text-brand" },
};

export const categoryMeta = (c: string) => CATEGORY_META[c as Category] ?? CATEGORY_META.Announcement;

export const STATUS_LABEL: Record<Status, string> = { DRAFT: "Draft", SCHEDULED: "Scheduled", SENT: "Sent", CANCELLED: "Cancelled" };
export const STATUS_TONE: Record<Status, "neutral" | "warning" | "success" | "danger"> = { DRAFT: "neutral", SCHEDULED: "warning", SENT: "success", CANCELLED: "danger" };

export const KIND_LABEL: Record<WishKind, string> = { BIRTHDAY: "Birthday", ANNIVERSARY: "Work anniversary", FESTIVAL: "Festival" };

export const THEME_META: Record<Theme, { label: string; emoji: string; card: string; accent: string }> = {
  classic: { label: "Classic", emoji: "✨", card: "bg-gradient-to-br from-brand-softer to-surface border-brand/20", accent: "text-brand" },
  confetti: {
    label: "Confetti",
    emoji: "🎉",
    card: "border-warning/30 bg-[radial-gradient(circle_at_10%_20%,rgba(244,114,182,.18)_0_6px,transparent_7px),radial-gradient(circle_at_80%_15%,rgba(250,204,21,.22)_0_5px,transparent_6px),radial-gradient(circle_at_60%_80%,rgba(56,189,248,.2)_0_6px,transparent_7px),radial-gradient(circle_at_25%_75%,rgba(52,211,153,.2)_0_4px,transparent_5px)] bg-[length:120px_90px] bg-surface",
    accent: "text-danger",
  },
  diya: { label: "Diya", emoji: "🪔", card: "border-warning/40 bg-gradient-to-br from-warning-soft via-surface to-warning-soft", accent: "text-warning" },
  floral: { label: "Floral", emoji: "🌸", card: "border-success/30 bg-gradient-to-br from-success-soft via-surface to-danger-soft", accent: "text-success" },
};

export const PLACEHOLDERS = [
  { token: "{name}", hint: "Full name" },
  { token: "{firstName}", hint: "First name" },
  { token: "{years}", hint: "Years at the firm (anniversaries)" },
  { token: "{festival}", hint: "Festival name" },
  { token: "{firm}", hint: "ASA" },
] as const;

/** Same substitution the server does — used for the live preview. */
export function fillPlaceholders(text: string, v: { name?: string; firstName?: string; years?: number | string; festival?: string }) {
  return text
    .replace(/\{name\}/g, v.name ?? "everyone")
    .replace(/\{firstName\}/g, v.firstName ?? v.name ?? "everyone")
    .replace(/\{years\}/g, v.years != null ? String(v.years) : "")
    .replace(/\{festival\}/g, v.festival ?? "")
    .replace(/\{firm\}/g, "ASA");
}

/** "Sun, 15 Oct 2026, 4:30 pm" in IST. */
export function fmtWhen(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function audienceSummary(a: Audience | null | undefined, peopleById?: Map<string, string>) {
  const parts: string[] = [];
  if (a?.departments?.length) parts.push(a.departments.join(" / "));
  if (a?.designations?.length) parts.push(a.designations.join(" / "));
  if (a?.roles?.length) parts.push(a.roles.join(" / "));
  if (a?.locations?.length) parts.push(a.locations.join(" / "));
  const base = parts.join(" · ");
  const n = a?.employeeIds?.length ?? 0;
  const ppl = n ? (peopleById && n <= 2 ? a!.employeeIds!.map((id) => peopleById.get(id) ?? "Someone").join(", ") : `${n} ${n === 1 ? "person" : "people"}`) : "";
  if (!base && !ppl) return "All active staff";
  return [base, ppl].filter(Boolean).join(" + ");
}
