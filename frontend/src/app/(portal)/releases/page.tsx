"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { History, Pencil, Plus, Rocket, Search, Sparkles, Trash2, Undo2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { canManageReleases, itemCount, TAGS, useReleaseMutations, useReleases, type Release, type ReleaseTag } from "@/components/releases/api";
import { ReleaseCard } from "@/components/releases/release-card";

type Pending = { kind: "publish" | "unpublish" | "delete"; release: Release } | null;

export default function ReleasesPage() {
  const { user } = useAuth();
  const manager = canManageReleases(user?.role);
  const q = useReleases(manager);
  const m = useReleaseMutations();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState<ReleaseTag | "">("");
  const [pending, setPending] = useState<Pending>(null);
  const [hash] = useState(() => (typeof window === "undefined" ? "" : decodeURIComponent(window.location.hash.slice(1))));

  const releases = useMemo(() => q.data?.data ?? [], [q.data]);
  const latestId = releases.find((r) => r.status === "PUBLISHED")?.id;
  const term = search.trim().toLowerCase();

  const shown = useMemo(
    () =>
      releases
        .filter((r) => !tag || r.tags.includes(tag))
        .map((r) => {
          if (!term) return { release: r, sections: r.sections };
          const head = `${r.version} ${r.title} ${r.summary ?? ""}`.toLowerCase().includes(term);
          const sections = r.sections
            .map((s) => (s.module.toLowerCase().includes(term) || head ? s : { ...s, items: s.items.filter((i) => `${i.type} ${i.text}`.toLowerCase().includes(term)) }))
            .filter((s) => s.items.length > 0);
          return { release: r, sections };
        })
        .filter((x) => !term || x.sections.length > 0),
    [releases, tag, term],
  );
  const matches = shown.reduce((n, x) => n + x.sections.reduce((k, s) => k + s.items.length, 0), 0);

  // Arriving from a notification (/releases#v1.2.0): bring that release into view.
  useEffect(() => {
    if (!hash || !releases.length) return;
    const t = setTimeout(() => document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    return () => clearTimeout(t);
  }, [hash, releases.length]);

  async function confirm() {
    if (!pending) return;
    const { kind, release } = pending;
    try {
      const res =
        kind === "publish" ? await m.publish.mutateAsync(release.id) : kind === "unpublish" ? await m.unpublish.mutateAsync(release.id) : await m.remove.mutateAsync(release.id);
      toast.success(res.message ?? "Done.");
      setPending(null);
    } catch (e) {
      toast.error("Couldn’t complete that", e instanceof ApiError ? e.message : undefined);
    }
  }
  const busy = m.publish.isPending || m.unpublish.isPending || m.remove.isPending;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-soft text-brand">
            <History className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 className="font-display text-2xl font-bold text-ink">Releases</h2>
            <p className="mt-0.5 text-sm text-ink-muted">What has changed in the portal, newest first.</p>
          </div>
        </div>
        {manager && (
          <Link href="/releases/new" className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-medium text-brand-ink shadow-sm hover:bg-brand-hover">
            <Plus className="h-4 w-4" aria-hidden /> New release
          </Link>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search changes, e.g. invoice, leave, export…"
            aria-label="Search changes"
            className="h-10 w-full rounded-xl border border-line-strong bg-surface pl-9 pr-3 text-sm text-ink outline-none placeholder:text-ink-subtle focus:border-brand focus:ring-4 focus:ring-brand/10"
          />
        </div>
        <div role="group" aria-label="Filter by tag" className="flex flex-wrap gap-1.5">
          {(["", ...TAGS] as const).map((t) => (
            <button
              key={t || "all"}
              type="button"
              aria-pressed={tag === t}
              onClick={() => setTag(t)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
                tag === t ? "bg-brand text-brand-ink" : "border border-line bg-surface text-ink-muted hover:text-ink",
              )}
            >
              {t || "All"}
            </button>
          ))}
        </div>
      </div>
      {term && !q.isLoading && (
        <p className="text-[13px] text-ink-muted" aria-live="polite">
          {matches ? `${plural(matches, "change")} match “${search.trim()}”.` : null}
        </p>
      )}

      {q.isLoading ? (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-3 rounded-[var(--radius-card)] border border-line bg-surface p-6">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ))}
        </div>
      ) : q.isError ? (
        <div className="rounded-[var(--radius-card)] border border-line bg-surface">
          <ErrorState message={q.error instanceof ApiError ? q.error.message : undefined} onRetry={() => q.refetch()} />
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-line bg-surface">
          <EmptyState
            icon={Sparkles}
            title={term || tag ? "No changes match these filters" : "No releases yet"}
            description={term || tag ? "Try a different word or clear the tag filter." : "Release notes will appear here when they’re published."}
            action={
              term || tag ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setSearch("");
                    setTag("");
                  }}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="space-y-5">
          {shown.map(({ release: r, sections }) => (
            <ReleaseCard
              key={r.id}
              release={r}
              sections={sections}
              latest={r.id === latestId}
              defaultOpen={hash === r.version ? r.sections.length : r.id === latestId ? 2 : 0}
              forceOpen={!!term}
              actions={
                manager ? (
                  <>
                    <span className="text-xs text-ink-subtle">{plural(itemCount(r), "change")}</span>
                    <Link
                      href={`/releases/${r.id}/edit`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink hover:bg-surface-muted"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
                    </Link>
                    {r.status === "DRAFT" ? (
                      <>
                        <Button size="sm" onClick={() => setPending({ kind: "publish", release: r })}>
                          <Rocket className="h-3.5 w-3.5" aria-hidden /> Publish
                        </Button>
                        <Button size="sm" variant="ghost" aria-label={`Delete draft ${r.version}`} onClick={() => setPending({ kind: "delete", release: r })}>
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => setPending({ kind: "unpublish", release: r })}>
                        <Undo2 className="h-3.5 w-3.5" aria-hidden /> Unpublish
                      </Button>
                    )}
                  </>
                ) : undefined
              }
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!pending}
        onClose={() => setPending(null)}
        onConfirm={confirm}
        busy={busy}
        tone={pending?.kind === "delete" ? "danger" : "primary"}
        title={pending?.kind === "publish" ? `Publish ${pending.release.version}?` : pending?.kind === "unpublish" ? `Unpublish ${pending.release.version}?` : `Delete ${pending?.release.version ?? ""}?`}
        confirmLabel={pending?.kind === "publish" ? "Publish and notify" : pending?.kind === "unpublish" ? "Unpublish" : "Delete draft"}
        description={
          pending?.kind === "publish"
            ? "Everyone with an active account gets a notification, and people see a “What’s new” prompt the next time they open the portal."
            : pending?.kind === "unpublish"
              ? "The release goes back to drafts and its notifications are withdrawn."
              : "This draft will be removed. This can’t be undone."
        }
      />
    </div>
  );
}
