"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { AnnouncementCard } from "@/components/announcements/announcement-card";
import { KEYS, useFeed, type Announcement } from "@/components/announcements/api";

type Filter = "all" | "unread" | "wishes";

export default function AnnouncementsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Feed />
    </Suspense>
  );
}

function Feed() {
  const params = useSearchParams();
  const openId = params.get("open");
  const qc = useQueryClient();
  const q = useFeed();
  const [filter, setFilter] = useState<Filter>("all");
  const [highlight, setHighlight] = useState<string | null>(null);
  const marked = useRef(new Set<string>());
  const nodes = useRef(new Map<string, HTMLElement>());

  const all = useMemo(() => q.data ?? [], [q.data]);
  const unread = all.filter((a) => !a.read).length;
  const rows = all.filter((a) => (filter === "unread" ? !a.read || a.id === openId : filter === "wishes" ? ["Birthday", "Anniversary", "Festival"].includes(a.category) : true));

  // Mark read once a card has been on screen (at least half of it) for a moment.
  const markRead = (id: string) => {
    if (marked.current.has(id)) return;
    marked.current.add(id);
    api(`announcements/${id}/read`, { method: "POST" })
      .then(() => {
        qc.setQueryData<Announcement[]>(KEYS.feed, (xs) => xs?.map((x) => (x.id === id ? { ...x, read: true } : x)));
        qc.invalidateQueries({ queryKey: KEYS.banner });
      })
      .catch(() => marked.current.delete(id));
  };

  useEffect(() => {
    if (!rows.length) return;
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.id!;
          if (e.isIntersecting) timers.set(id, setTimeout(() => markRead(id), 800));
          else clearTimeout(timers.get(id));
        }
      },
      { threshold: 0.5 },
    );
    for (const a of rows) {
      const el = nodes.current.get(a.id);
      if (el && !a.read) io.observe(el);
    }
    return () => {
      io.disconnect();
      timers.forEach((t) => clearTimeout(t));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-observe only when the visible list changes
  }, [rows.map((r) => `${r.id}:${r.read}`).join("|")]);

  // ?open=<id> — scroll to it, highlight it and mark it read.
  useEffect(() => {
    if (!openId || !q.data) return;
    const el = nodes.current.get(openId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus({ preventScroll: true });
    setHighlight(openId);
    markRead(openId);
    const t = setTimeout(() => setHighlight(null), 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, q.data]);

  const missing = openId && q.data && !all.some((a) => a.id === openId);

  return (
    <div className="space-y-5">
      <PageHeader title="Announcements" description="News, policies, events and wishes from the firm." />

      <Segmented<Filter>
        aria-label="Show"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All", count: all.length },
          { value: "unread", label: "Unread", count: unread },
          { value: "wishes", label: "Wishes" },
        ]}
      />

      {missing && <p className="rounded-xl border border-line bg-surface-muted px-4 py-3 text-sm text-ink-muted">That announcement is no longer available — it may have been withdrawn.</p>}

      {q.isLoading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title={filter === "unread" ? "You're all caught up" : "No announcements yet"}
          description={filter === "unread" ? "Nothing new since you last looked." : "When the firm shares news with you, it will appear here."}
        />
      ) : (
        <div className="mx-auto max-w-3xl space-y-4">
          {rows.map((a) => (
            <div
              key={a.id}
              data-id={a.id}
              ref={(el) => {
                if (el) nodes.current.set(a.id, el);
                else nodes.current.delete(a.id);
              }}
              tabIndex={-1}
              className="scroll-mt-24 outline-none"
            >
              <AnnouncementCard data={a} highlight={highlight === a.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
