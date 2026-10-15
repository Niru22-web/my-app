"use client";

import { useMemo, useState } from "react";
import { Bug, Inbox, MessageSquareHeart, MessagesSquare, Star } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatNumber } from "@/lib/format";
import { timeAgo } from "@/lib/notifications";
import { StatCard } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/inputs";
import { EmptyState } from "@/components/ui/empty-state";
import { DataTable, type Column } from "@/components/ui/data-table";
import { CATEGORIES, isFeedbackReviewer, STATUS_LABEL, STATUS_TONE, STATUSES, useFeedback, type Feedback, type FeedbackStatus } from "@/components/feedback/api";
import { FeedbackHeader, Stars } from "@/components/feedback/my-feedback";
import { ReviewDialog } from "@/components/feedback/review-dialog";

type Tab = FeedbackStatus | "open" | "all";

export default function FeedbackReviewPage() {
  const { user } = useAuth();
  const reviewer = isFeedbackReviewer(user?.role);
  const q = useFeedback("all", reviewer);
  const [tab, setTab] = useState<Tab>("open");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [rating, setRating] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const all = useMemo(() => q.data?.data ?? [], [q.data]);
  const summary = q.data?.summary;
  const count = (s: FeedbackStatus) => all.filter((f) => f.status === s).length;
  const isOpen = (f: Feedback) => f.status === "NEW" || f.status === "REVIEWED" || f.status === "PLANNED";

  const rows = all.filter((f) => {
    if (tab === "open" && !isOpen(f)) return false;
    if (tab !== "open" && tab !== "all" && f.status !== tab) return false;
    if (category && f.category !== category) return false;
    if (rating === "none" && f.rating) return false;
    if (rating === "low" && !(f.rating && f.rating <= 2)) return false;
    if (rating && !["none", "low"].includes(rating) && f.rating !== Number(rating)) return false;
    const x = search.trim().toLowerCase();
    return !x || `${f.message} ${f.module ?? ""} ${f.category} ${f.sender?.name ?? ""} ${f.response ?? ""}`.toLowerCase().includes(x);
  });
  const selected = all.find((f) => f.id === openId) ?? null;

  if (!reviewer) {
    return (
      <div className="space-y-6">
        <FeedbackHeader />
        <EmptyState title="Reviewing feedback is limited to Admin, Owner, IT and HR" description="You can send feedback and follow your own on the Feedback page." />
      </div>
    );
  }

  const columns: Column<Feedback>[] = [
    {
      key: "message",
      header: "Feedback",
      sortValue: (f) => f.createdAt,
      exportHeader: "Message",
      exportValue: (f) => f.message,
      cell: (f) => (
        <div className="min-w-0 max-w-[460px]">
          <p className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-brand">{f.category}</span>
            {f.module && <span className="text-ink-subtle">· {f.module}</span>}
            {f.bugId && (
              <span className="inline-flex items-center gap-1 text-ink-subtle">
                · <Bug className="h-3 w-3" aria-hidden /> Bug logged
              </span>
            )}
          </p>
          <p className="line-clamp-2 text-ink">{f.message}</p>
          {f.response && <p className="truncate text-xs text-ink-subtle">Replied: {f.response}</p>}
        </div>
      ),
    },
    {
      key: "rating",
      header: "Rating",
      hideBelow: "sm",
      sortValue: (f) => f.rating ?? 0,
      exportValue: (f) => f.rating ?? "",
      cell: (f) => (f.rating ? <Stars value={f.rating} /> : <span className="text-ink-subtle">—</span>),
    },
    { key: "status", header: "Status", sortValue: (f) => STATUSES.indexOf(f.status), exportValue: (f) => STATUS_LABEL[f.status], cell: (f) => <Badge tone={STATUS_TONE[f.status]}>{STATUS_LABEL[f.status]}</Badge> },
    {
      key: "sender",
      header: "From",
      hideBelow: "md",
      sortValue: (f) => (f.anonymous ? "~" : (f.sender?.name ?? "")),
      exportValue: (f) => (f.anonymous ? "Anonymous" : (f.sender?.name ?? "")),
      cell: (f) => (f.anonymous ? <span className="italic text-ink-subtle">Anonymous</span> : <span className="text-ink-muted">{f.sender?.name ?? "—"}</span>),
    },
    {
      key: "created",
      header: "Sent",
      align: "right",
      hideBelow: "sm",
      sortValue: (f) => f.createdAt,
      exportValue: (f) => f.createdAt.slice(0, 10),
      cell: (f) => <span className="whitespace-nowrap text-ink-muted">{timeAgo(f.createdAt)}</span>,
    },
  ];

  const filtered = !!(search || category || rating);

  return (
    <div className="space-y-6">
      <FeedbackHeader />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="Summary">
        <StatCard label="Total feedback" icon={MessagesSquare} loading={q.isLoading} value={formatNumber(summary?.total ?? 0)} />
        <StatCard label="New" icon={Inbox} tone="brand" loading={q.isLoading} value={formatNumber(summary?.counts.NEW ?? 0)} hint="waiting for a look" />
        <StatCard
          label="Average rating"
          icon={Star}
          tone="warning"
          loading={q.isLoading}
          value={summary?.averageRating != null ? `${summary.averageRating.toFixed(1)} / 5` : "—"}
          hint={summary?.rated ? `from ${formatNumber(summary.rated)} rated` : "no ratings yet"}
        />
        <StatCard label="Converted to bugs" icon={Bug} tone="success" loading={q.isLoading} value={formatNumber(summary?.convertedToBugs ?? 0)} />
      </section>

      <DataTable
        exportName="feedback"
        itemsLabel="feedback items"
        filterTabs={[
          { key: "open", label: "Open", count: all.filter(isOpen).length },
          ...STATUSES.map((s) => ({ key: s, label: STATUS_LABEL[s], count: count(s) })),
          { key: "all", label: "All", count: all.length },
        ]}
        activeFilterTab={tab}
        onFilterTabChange={(k) => setTab(k as Tab)}
        searchable
        searchPlaceholder="Search feedback…"
        searchValue={search}
        onSearchChange={setSearch}
        toolbarActions={
          <>
            <Select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className="w-36">
              <option value="">Any category</option>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
            <Select aria-label="Rating" value={rating} onChange={(e) => setRating(e.target.value)} className="w-36">
              <option value="">Any rating</option>
              <option value="low">1–2 stars</option>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={String(n)}>
                  {n} star{n > 1 ? "s" : ""}
                </option>
              ))}
              <option value="none">Not rated</option>
            </Select>
          </>
        }
        rows={rows}
        columns={columns}
        rowKey={(f) => f.id}
        rowLabel={(f) => `Open ${f.category} feedback`}
        loading={q.isLoading}
        error={q.isError}
        onRetry={() => q.refetch()}
        onRowClick={(f) => setOpenId(f.id)}
        initialSort={{ key: "message", dir: "desc" }}
        pageSize={25}
        empty={{
          icon: MessageSquareHeart,
          title: filtered ? "No feedback matches these filters" : tab === "open" ? "Nothing waiting — all caught up" : "No feedback here",
        }}
      />

      <ReviewDialog feedback={selected} onClose={() => setOpenId(null)} />
    </div>
  );
}
