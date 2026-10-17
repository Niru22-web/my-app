"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, ArrowLeft, BellOff, CheckCheck, ExternalLink, Inbox, Mail, MailOpen, Pin, Search, Star, Trash2, UserCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import { isSnoozed, timeAgo } from "@/lib/notifications";
import { normRole } from "@/lib/roles";
import { cn } from "@/lib/cn";
import type { AppNotification, Envelope } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/inputs";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";

type N = AppNotification & { id: string };
type Filter = "all" | "unread" | "starred" | "pinned" | "high" | "snoozed" | "archived";
type Patch = Partial<Pick<N, "isRead" | "isArchived" | "isPinned" | "isStarred" | "snoozedUntil">>;

// Separate key from the header bell so its 30s refresh (non-archived only) never drops archived items here.
const KEY = ["notifications", "inbox"];
const HIGH = ["high", "critical", "urgent"];
const MODULES = ["HR", "Finance", "IT", "HelpDesk", "Admin", "Employee"];

/** Only in-app links are followed; anything absolute stays as text. */
const internalLink = (u?: string | null) => (u && u.startsWith("/") && !u.startsWith("//") ? u : null);

function tomorrowMorning() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

export default function InboxPage() {
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  // Same people the approval route allows: Admin, Owner, HR.
  const canApprove = ["admin", "owner", "hr"].includes(normRole(user?.role));

  const [filter, setFilter] = useState<Filter>("all");
  const [mod, setMod] = useState("");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);

  const q = useQuery({
    queryKey: KEY,
    queryFn: async () => ((await api<Envelope<N[]>>("notifications", { query: { archived: "all" } })).data ?? []).filter((n) => n.id),
  });
  const all = useMemo(() => q.data ?? [], [q.data]);

  const counts = useMemo(() => {
    const live = all.filter((n) => !n.isArchived && !isSnoozed(n));
    return { unread: live.filter((n) => !n.isRead).length, archived: all.filter((n) => n.isArchived).length, snoozed: all.filter((n) => !n.isArchived && isSnoozed(n)).length };
  }, [all]);

  const list = useMemo(() => {
    const s = search.trim().toLowerCase();
    return all.filter((n) => {
      if (filter === "archived") {
        if (!n.isArchived) return false;
      } else if (n.isArchived) return false;
      else if (filter === "snoozed") {
        if (!isSnoozed(n)) return false;
      } else if (isSnoozed(n)) return false;
      if (filter === "unread" && n.isRead) return false;
      if (filter === "starred" && !n.isStarred) return false;
      if (filter === "pinned" && !n.isPinned) return false;
      if (filter === "high" && !HIGH.includes((n.priority ?? "").toLowerCase())) return false;
      if (mod && n.module !== mod) return false;
      return !s || `${n.title ?? ""} ${n.message} ${n.type ?? ""}`.toLowerCase().includes(s);
    });
  }, [all, filter, mod, search]);

  const open = all.find((n) => n.id === openId) ?? null;

  // Optimistic update with rollback — the old inbox left the UI out of sync when a call failed.
  const patch = useMutation({
    mutationFn: ({ ids, data }: { ids: string[]; data: Patch }) =>
      ids.length === 1
        ? api(`notifications/${ids[0]}`, { method: "PATCH", body: data })
        : api("notifications/bulk-update", { method: "POST", body: { ids, ...data } }),
    onMutate: async ({ ids, data }) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<N[]>(KEY);
      qc.setQueryData<N[]>(KEY, (p = []) => p.map((n) => (ids.includes(n.id) ? { ...n, ...data } : n)));
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
      toast.error("Couldn’t update", e instanceof ApiError ? e.message : undefined);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const remove = useMutation({
    mutationFn: (ids: string[]) => (ids.length === 1 ? api(`notifications/${ids[0]}`, { method: "DELETE" }) : api("notifications/bulk-delete", { method: "POST", body: { ids } })),
    onSuccess: (_r, ids) => {
      qc.setQueryData<N[]>(KEY, (p = []) => p.filter((n) => !ids.includes(n.id)));
      setPicked(new Set());
      if (openId && ids.includes(openId)) setOpenId(null);
      setConfirmDelete(null);
      toast.success(ids.length === 1 ? "Notification deleted" : `${ids.length} notifications deleted`);
    },
    onError: (e) => toast.error("Couldn’t delete", e instanceof ApiError ? e.message : undefined),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const readAll = useMutation({
    mutationFn: () => api("notifications/read-all", { method: "PATCH" }),
    onSuccess: () => toast.success("All caught up"),
    onError: (e) => toast.error("Couldn’t mark all as read", e instanceof ApiError ? e.message : undefined),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const approve = useMutation({
    mutationFn: (employeeId: string) => api("notifications/approve-employee", { method: "POST", body: { employeeId } }),
    onSuccess: () => {
      toast.success("Employee approved", "They can now sign in.");
      void qc.invalidateQueries({ queryKey: ["notifications"] });
      void qc.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (e) => toast.error("Couldn’t approve", e instanceof ApiError ? e.message : undefined),
  });

  const select = (n: N) => {
    setOpenId(n.id);
    if (!n.isRead) patch.mutate({ ids: [n.id], data: { isRead: true } });
  };
  const toggle = (id: string) =>
    setPicked((p) => {
      const s = new Set(p);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  const pickedIds = [...picked].filter((id) => list.some((n) => n.id === id));
  const allPicked = list.length > 0 && pickedIds.length === list.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inbox"
        description={counts.unread ? `${counts.unread} unread` : "You’re all caught up"}
        actions={
          <Button variant="secondary" disabled={!counts.unread} loading={readAll.isPending} onClick={() => readAll.mutate()}>
            <CheckCheck className="h-4 w-4" /> Mark all read
          </Button>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Segmented
          aria-label="Filter"
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setPicked(new Set());
          }}
          options={[
            { value: "all", label: "All" },
            { value: "unread", label: "Unread", count: counts.unread || undefined },
            { value: "starred", label: "Starred" },
            { value: "pinned", label: "Pinned" },
            { value: "high", label: "High priority" },
            { value: "snoozed", label: "Snoozed", count: counts.snoozed || undefined },
            { value: "archived", label: "Archived" },
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select aria-label="Module" value={mod} onChange={(e) => setMod(e.target.value)} className="sm:w-40">
            <option value="">All modules</option>
            {MODULES.map((m) => (
              <option key={m} value={m}>
                {m === "HelpDesk" ? "Help Desk" : m}
              </option>
            ))}
          </Select>
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
            <Input placeholder="Search notifications" aria-label="Search notifications" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Card className={cn("overflow-hidden", open && "hidden xl:block")}>
          <div className="flex min-h-12 items-center gap-3 border-b border-line px-4 py-2">
            <input
              type="checkbox"
              aria-label="Select all"
              className="h-4 w-4 accent-[var(--brand)]"
              checked={allPicked}
              disabled={!list.length}
              onChange={() => setPicked(allPicked ? new Set() : new Set(list.map((n) => n.id)))}
            />
            {pickedIds.length ? (
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-2 text-[13px] text-ink-muted">{pickedIds.length} selected</span>
                <Button size="sm" variant="ghost" onClick={() => patch.mutate({ ids: pickedIds, data: { isRead: true } })}>
                  <MailOpen className="h-4 w-4" /> Read
                </Button>
                <Button size="sm" variant="ghost" onClick={() => patch.mutate({ ids: pickedIds, data: { isRead: false } })}>
                  <Mail className="h-4 w-4" /> Unread
                </Button>
                <Button size="sm" variant="ghost" onClick={() => (patch.mutate({ ids: pickedIds, data: { isArchived: filter !== "archived" } }), setPicked(new Set()))}>
                  {filter === "archived" ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />} {filter === "archived" ? "Restore" : "Archive"}
                </Button>
                <Button size="sm" variant="ghost" className="text-danger" onClick={() => setConfirmDelete(pickedIds)}>
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              </div>
            ) : (
              <span className="text-[13px] text-ink-subtle">{q.isLoading ? "Loading…" : `${list.length} notification${list.length === 1 ? "" : "s"}`}</span>
            )}
          </div>
          {q.isError ? (
            <ErrorState error={q.error} message="Notifications couldn’t be loaded." onRetry={() => q.refetch()} />
          ) : q.isLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <EmptyState icon={Inbox} title={filter === "all" && !mod && !search ? "No notifications yet" : "Nothing here"} description={filter === "all" && !mod && !search ? "Approvals, ticket updates and reminders will appear here." : undefined} />
          ) : (
            <ul className="max-h-[70vh] divide-y divide-line overflow-y-auto">
              {list.map((n) => (
                <li key={n.id} className={cn("flex items-start gap-3 px-4 py-3 transition-colors", n.id === openId ? "bg-brand-softer" : "hover:bg-surface-muted")}>
                  <input type="checkbox" aria-label={`Select ${n.title ?? "notification"}`} className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand)]" checked={picked.has(n.id)} onChange={() => toggle(n.id)} />
                  <button className="min-w-0 flex-1 text-left" onClick={() => select(n)}>
                    <span className="flex items-center gap-2">
                      {!n.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="Unread" />}
                      <span className={cn("truncate text-sm", n.isRead ? "text-ink" : "font-semibold text-ink")}>{n.title || "Notification"}</span>
                      {n.isPinned && <Pin className="h-3.5 w-3.5 shrink-0 text-ink-subtle" aria-label="Pinned" />}
                      {n.isStarred && <Star className="h-3.5 w-3.5 shrink-0 fill-warning text-warning" aria-label="Starred" />}
                      <span className="ml-auto shrink-0 text-xs text-ink-subtle">{timeAgo(n.createdAt)}</span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-[13px] text-ink-muted">{n.message}</span>
                    <span className="mt-1 flex gap-1.5">
                      {n.module && <Badge>{n.module === "HelpDesk" ? "Help Desk" : n.module}</Badge>}
                      {HIGH.includes((n.priority ?? "").toLowerCase()) && <Badge tone="danger">{n.priority}</Badge>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className={cn(!open && "hidden xl:block")}>
          {!open ? (
            <EmptyState icon={MailOpen} title="Select a notification" description="Its details and actions show here." className="py-24" />
          ) : (
            <div className="p-5 sm:p-6">
              <Button variant="ghost" size="sm" className="-ml-2 mb-3 xl:hidden" onClick={() => setOpenId(null)}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <div className="flex flex-wrap items-center gap-1.5">
                {open.module && <Badge>{open.module === "HelpDesk" ? "Help Desk" : open.module}</Badge>}
                {open.priority && <Badge tone={HIGH.includes(open.priority.toLowerCase()) ? "danger" : "neutral"}>{open.priority}</Badge>}
                {open.isArchived && <Badge tone="warning">Archived</Badge>}
                {isSnoozed(open) && <Badge tone="brand">Snoozed until {new Date(open.snoozedUntil!).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</Badge>}
              </div>
              <h2 className="mt-3 text-lg font-semibold text-ink">{open.title || "Notification"}</h2>
              <p className="mt-1 text-xs text-ink-subtle">
                {new Date(open.createdAt).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}
              </p>
              <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-ink">{open.message}</p>

              <div className="mt-6 flex flex-wrap gap-2">
                {internalLink(open.actionUrl) && (
                  <Button onClick={() => router.push(internalLink(open.actionUrl)!)}>
                    <ExternalLink className="h-4 w-4" /> Open
                  </Button>
                )}
                {open.type === "employee_approval" && open.relatedId && canApprove && (
                  <Button loading={approve.isPending} onClick={() => approve.mutate(open.relatedId!)}>
                    <UserCheck className="h-4 w-4" /> Approve employee
                  </Button>
                )}
              </div>

              <div className="mt-6 flex flex-wrap gap-1 border-t border-line pt-4">
                <Button size="sm" variant="ghost" onClick={() => patch.mutate({ ids: [open.id], data: { isStarred: !open.isStarred } })}>
                  <Star className={cn("h-4 w-4", open.isStarred && "fill-warning text-warning")} /> {open.isStarred ? "Unstar" : "Star"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => patch.mutate({ ids: [open.id], data: { isPinned: !open.isPinned } })}>
                  <Pin className="h-4 w-4" /> {open.isPinned ? "Unpin" : "Pin"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => patch.mutate({ ids: [open.id], data: { isRead: !open.isRead } })}>
                  {open.isRead ? <Mail className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />} {open.isRead ? "Mark unread" : "Mark read"}
                </Button>
                {!open.isArchived && (
                  <Button size="sm" variant="ghost" onClick={() => patch.mutate({ ids: [open.id], data: { snoozedUntil: isSnoozed(open) ? null : tomorrowMorning() } })}>
                    <BellOff className="h-4 w-4" /> {isSnoozed(open) ? "Unsnooze" : "Snooze till tomorrow 9 AM"}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => patch.mutate({ ids: [open.id], data: { isArchived: !open.isArchived } })}>
                  {open.isArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />} {open.isArchived ? "Restore" : "Archive"}
                </Button>
                <Button size="sm" variant="ghost" className="text-danger" onClick={() => setConfirmDelete([open.id])}>
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        tone="danger"
        title={confirmDelete?.length === 1 ? "Delete this notification?" : `Delete ${confirmDelete?.length} notifications?`}
        description="Deleted notifications can’t be recovered. Archive them instead if you might need them later."
        confirmLabel="Delete"
        busy={remove.isPending}
        onConfirm={() => confirmDelete && remove.mutate(confirmDelete)}
      />
    </div>
  );
}
