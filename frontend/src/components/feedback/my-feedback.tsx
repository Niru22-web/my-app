"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Bug, MessageSquareHeart, MessageSquareReply, Star, Trash2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { timeAgo } from "@/lib/notifications";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm";
import { TabNav } from "@/components/ui/tab-nav";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import { isFeedbackReviewer, STATUS_LABEL, STATUS_TONE, useFeedback, useFeedbackMutations, type Feedback } from "./api";

export function FeedbackHeader() {
  const { user } = useAuth();
  const pathname = usePathname();
  return (
    <div className="space-y-4">
      <PageHeader title="Feedback" description="Tell us what works, what doesn’t and what you’d like next. Every message is read." />
      {isFeedbackReviewer(user?.role) && (
        <TabNav
          label="Feedback sections"
          tabs={[
            { href: "/feedback", label: "Send & your feedback", active: pathname === "/feedback" },
            { href: "/feedback/review", label: "Review" },
          ]}
        />
      )}
    </div>
  );
}

export function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5 stars`} role="img">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={n <= value ? "h-3.5 w-3.5 fill-amber-400 text-amber-400" : "h-3.5 w-3.5 text-line-strong"} aria-hidden />
      ))}
    </span>
  );
}

export function MyFeedbackList() {
  const q = useFeedback("mine");
  const { remove } = useFeedbackMutations();
  const toast = useToast();
  const [del, setDel] = useState<Feedback | null>(null);
  const rows = q.data?.data ?? [];

  async function confirmDelete() {
    if (!del) return;
    try {
      const res = await remove.mutateAsync(del.id);
      toast.success(res.message ?? "Feedback deleted.");
      setDel(null);
    } catch (e) {
      toast.error("Couldn’t delete", e instanceof ApiError ? e.message : undefined);
    }
  }

  if (q.isLoading)
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  if (q.isError) return <ErrorState message={q.error instanceof ApiError ? q.error.message : undefined} onRetry={() => q.refetch()} />;
  if (!rows.length) return <EmptyState icon={MessageSquareHeart} title="You haven’t sent any feedback yet" description="What you send appears here, along with any reply from the team." />;

  return (
    <>
      <ul className="space-y-3">
        {rows.map((f) => (
          <li key={f.id} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={STATUS_TONE[f.status]}>{STATUS_LABEL[f.status]}</Badge>
              <span className="text-xs font-semibold text-ink">{f.category}</span>
              {f.module && <span className="text-xs text-ink-subtle">· {f.module}</span>}
              {f.rating ? <Stars value={f.rating} /> : null}
              {f.anonymous && <span className="text-xs text-ink-subtle">· Sent anonymously</span>}
              <span className="ml-auto text-xs text-ink-subtle" title={formatDate(f.createdAt)}>
                {timeAgo(f.createdAt)}
              </span>
              {f.status === "NEW" && (
                <button type="button" onClick={() => setDel(f)} className="grid h-7 w-7 place-items-center rounded-md text-ink-subtle hover:bg-surface-muted hover:text-danger" aria-label="Delete this feedback">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{f.message}</p>
            {f.bugId && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-ink-muted">
                <Bug className="h-3.5 w-3.5" aria-hidden /> Logged in the bug tracker
              </p>
            )}
            {f.response && (
              <div className="mt-3 rounded-lg border-l-2 border-brand bg-brand-softer px-3 py-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-brand">
                  <MessageSquareReply className="h-3.5 w-3.5" aria-hidden /> Reply{f.respondedBy ? ` from ${f.respondedBy}` : ""}
                  {f.respondedAt && <span className="font-normal text-ink-subtle">· {formatDate(f.respondedAt)}</span>}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{f.response}</p>
              </div>
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={confirmDelete}
        busy={remove.isPending}
        tone="danger"
        title="Delete this feedback?"
        description="You can delete feedback until the team has looked at it."
        confirmLabel="Delete"
      />
    </>
  );
}
