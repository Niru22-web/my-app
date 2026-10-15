"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, Copy, Megaphone, Pencil, Pin, PinOff, Plus, Send, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { normRole } from "@/lib/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/inputs";
import { ConfirmDialog } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/empty-state";
import { DataTable, type Column } from "@/components/ui/data-table";
import { useToast } from "@/components/ui/toast";
import { CategoryChip } from "@/components/announcements/announcement-card";
import { Composer, emptySeed, seedFrom, type ComposerSeed } from "@/components/announcements/composer";
import {
  audienceSummary,
  canManageAnnouncements,
  CATEGORIES,
  fmtWhen,
  STATUS_LABEL,
  STATUS_TONE,
  useAudienceOptions,
  useManageList,
  type Announcement,
  type Status,
} from "@/components/announcements/api";

type Tab = Status | "ALL";
type Pending = { kind: "send" | "cancel" | "delete"; row: Announcement };

export default function ManageAnnouncementsPage() {
  const { user } = useAuth();
  const allowed = canManageAnnouncements(user?.role);
  const isAdmin = ["admin", "owner"].includes(normRole(user?.role));
  const q = useManageList(allowed);
  const opts = useAudienceOptions(allowed);
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("ALL");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [seed, setSeed] = useState<ComposerSeed | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const closeComposer = useCallback(() => setSeed(null), []);

  const peopleById = useMemo(() => new Map((opts.data?.people ?? []).map((p) => [p.id, p.name])), [opts.data]);
  const all = useMemo(() => q.data ?? [], [q.data]);
  const count = (s: Status) => all.filter((a) => a.status === s).length;
  const rows = all.filter((a) => {
    if (tab !== "ALL" && a.status !== tab) return false;
    if (category && a.category !== category) return false;
    const x = search.trim().toLowerCase();
    return !x || `${a.title} ${a.message} ${a.sender.name} ${a.category}`.toLowerCase().includes(x);
  });

  const act = useMutation({
    mutationFn: async (p: Pending | { kind: "pin"; row: Announcement }) => {
      const id = p.row.id;
      if (p.kind === "send") return api<{ message: string }>(`announcements/${id}/send`, { method: "POST" });
      if (p.kind === "cancel") return api<{ message: string }>(`announcements/${id}/cancel`, { method: "POST" });
      if (p.kind === "delete") return api<{ message: string }>(`announcements/${id}`, { method: "DELETE" });
      return api<{ message: string }>(`announcements/${id}`, { method: "PUT", body: { pinned: !p.row.pinned } });
    },
    onSuccess: (r, p) => {
      toast.success(p.kind === "pin" ? (p.row.pinned ? "Unpinned." : "Pinned as banner.") : (r.message ?? "Done."));
      setPending(null);
    },
    onError: (e) => toast.error("Couldn’t do that", e instanceof ApiError ? e.message : undefined),
    onSettled: () => qc.invalidateQueries({ queryKey: ["announcements"] }),
  });

  if (!allowed) {
    return <EmptyState icon={Megaphone} title="Not available" description="Only Admin, Owner and HR can manage announcements." />;
  }

  const columns: Column<Announcement>[] = [
    {
      key: "title",
      header: "Announcement",
      sortValue: (a) => a.title.toLowerCase(),
      exportValue: (a) => a.title,
      searchValue: (a) => `${a.title} ${a.message}`,
      cell: (a) => (
        <div className="min-w-0 max-w-md">
          <div className="flex flex-wrap items-center gap-1.5">
            <CategoryChip category={a.category} />
            {a.pinned && <Pin className="h-3.5 w-3.5 text-ink-subtle" aria-label="Pinned" />}
          </div>
          <p className="mt-1 truncate font-medium text-ink">{a.title}</p>
          <p className="truncate text-xs text-ink-subtle">{audienceSummary(a.audience, peopleById)}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (a) => a.status,
      exportValue: (a) => STATUS_LABEL[a.status],
      cell: (a) => <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>,
    },
    {
      key: "reach",
      header: "Read by",
      sortValue: (a) => (a.recipientCount ? (a.readCount ?? 0) / a.recipientCount : -1),
      exportValue: (a) => (a.status === "SENT" || a.recipientCount ? `${a.readCount ?? 0} of ${a.recipientCount}` : ""),
      exportHeader: "Read by",
      cell: (a) => {
        if (!a.recipientCount) return <span className="text-xs text-ink-subtle">Not sent yet</span>;
        const pct = Math.round(((a.readCount ?? 0) / a.recipientCount) * 100);
        return (
          <div className="w-36">
            <p className="text-xs text-ink">
              {a.readCount ?? 0} of {a.recipientCount}
            </p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Read by ${pct}%`}>
              <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      },
    },
    {
      key: "when",
      header: "When",
      hideBelow: "md",
      sortValue: (a) => a.sentAt ?? a.scheduledAt ?? a.updatedAt,
      exportValue: (a) => fmtWhen(a.sentAt ?? a.scheduledAt ?? a.updatedAt),
      cell: (a) => (
        <div className="text-xs">
          <p className="text-ink">{fmtWhen(a.sentAt ?? a.scheduledAt ?? a.updatedAt)}</p>
          <p className="text-ink-subtle">{a.sentAt ? "Sent" : a.scheduledAt && a.status === "SCHEDULED" ? "Scheduled" : "Last edited"}</p>
        </div>
      ),
    },
    {
      key: "by",
      header: "By",
      hideBelow: "lg",
      sortValue: (a) => a.sender.name,
      cell: (a) => <span className="text-xs text-ink-muted">{a.sender.name}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (a) => {
        const editable = a.status === "DRAFT" || a.status === "SCHEDULED";
        const btn = "grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-brand";
        return (
          <div className="flex items-center justify-end gap-0.5">
            {editable && (
              <>
                <button type="button" className={btn} onClick={() => setSeed(seedFrom(a, false))} aria-label={`Edit ${a.title}`} title="Edit">
                  <Pencil className="h-4 w-4" />
                </button>
                <button type="button" className={btn} onClick={() => setPending({ kind: "send", row: a })} aria-label={`Send ${a.title} now`} title="Send now">
                  <Send className="h-4 w-4" />
                </button>
              </>
            )}
            {a.status === "SENT" && (
              <button type="button" className={btn} onClick={() => act.mutate({ kind: "pin", row: a })} aria-label={a.pinned ? `Unpin ${a.title}` : `Pin ${a.title}`} title={a.pinned ? "Unpin banner" : "Pin as banner"}>
                {a.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
              </button>
            )}
            <button type="button" className={btn} onClick={() => setSeed(seedFrom(a, true))} aria-label={`Duplicate ${a.title}`} title="Duplicate">
              <Copy className="h-4 w-4" />
            </button>
            {a.status !== "CANCELLED" && (
              <button type="button" className={btn} onClick={() => setPending({ kind: "cancel", row: a })} aria-label={a.status === "SENT" ? `Withdraw ${a.title}` : `Cancel ${a.title}`} title={a.status === "SENT" ? "Withdraw" : "Cancel"}>
                <Ban className="h-4 w-4" />
              </button>
            )}
            {(a.status === "DRAFT" || isAdmin) && (
              <button type="button" className={`${btn} hover:text-danger`} onClick={() => setPending({ kind: "delete", row: a })} aria-label={`Delete ${a.title}`} title="Delete">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        );
      },
    },
  ];

  const confirmText: Record<Pending["kind"], { title: string; label: string; body: (a: Announcement) => string; tone: "primary" | "danger" }> = {
    send: { title: "Send now?", label: "Send now", tone: "primary", body: (a) => `“${a.title}” will go to ${audienceSummary(a.audience, peopleById).toLowerCase()} right away.` },
    cancel: {
      title: "Cancel announcement?",
      label: "Yes, cancel",
      tone: "danger",
      body: (a) => (a.status === "SENT" ? `“${a.title}” will be withdrawn — staff will no longer see it in their feed.` : `“${a.title}” won’t be sent. You can duplicate it later.`),
    },
    delete: { title: "Delete announcement?", label: "Delete", tone: "danger", body: (a) => `“${a.title}” and its read receipts will be removed for good.` },
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Manage announcements"
        description="Write, schedule and track announcements for the firm."
        actions={
          <Button onClick={() => setSeed(emptySeed())}>
            <Plus className="h-4 w-4" aria-hidden /> New announcement
          </Button>
        }
      />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(a) => a.id}
        loading={q.isLoading}
        error={q.isError}
        onRetry={() => q.refetch()}
        searchable
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search announcements"
        filterTabs={[
          { key: "ALL", label: "All", count: all.length },
          { key: "DRAFT", label: "Draft", count: count("DRAFT") },
          { key: "SCHEDULED", label: "Scheduled", count: count("SCHEDULED") },
          { key: "SENT", label: "Sent", count: count("SENT") },
          { key: "CANCELLED", label: "Cancelled", count: count("CANCELLED") },
        ]}
        activeFilterTab={tab}
        onFilterTabChange={(k) => setTab(k as Tab)}
        toolbarActions={
          <Select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className="w-44">
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        }
        itemsLabel="announcements"
        exportName="announcements"
        initialSort={{ key: "when", dir: "desc" }}
        empty={{
          icon: Megaphone,
          title: all.length ? "Nothing matches" : "No announcements yet",
          description: all.length ? "Try another tab or search." : "Write the first one for the firm.",
          action: all.length ? undefined : (
            <Button size="sm" onClick={() => setSeed(emptySeed())}>
              <Plus className="h-4 w-4" aria-hidden /> New announcement
            </Button>
          ),
        }}
      />

      <Composer open={!!seed} seed={seed} onClose={closeComposer} />

      {pending && (
        <ConfirmDialog
          open
          onClose={() => setPending(null)}
          onConfirm={() => act.mutate(pending)}
          busy={act.isPending}
          title={confirmText[pending.kind].title}
          confirmLabel={confirmText[pending.kind].label}
          tone={confirmText[pending.kind].tone}
          description={confirmText[pending.kind].body(pending.row)}
        />
      )}
    </div>
  );
}
