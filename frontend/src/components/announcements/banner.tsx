"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import type { Envelope } from "@/lib/types";
import { categoryMeta, KEYS, THEME_META, type Announcement } from "./api";

/**
 * Slim banner for the latest pinned announcement the signed-in person hasn't dismissed.
 * Mount once in the portal shell; renders nothing when there is no banner.
 */
export function AnnouncementBanner() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: KEYS.banner,
    queryFn: async () => (await api<Envelope<Announcement | null>>("announcements/banner")).data,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    retry: false,
  });
  const dismiss = useMutation({
    mutationFn: (id: string) => api(`announcements/${id}/read`, { method: "POST" }),
    onMutate: () => qc.setQueryData(KEYS.banner, null),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: KEYS.banner });
      qc.invalidateQueries({ queryKey: KEYS.feed });
    },
  });

  const a = q.data;
  if (!a) return null;
  const Icon = categoryMeta(a.category).icon;
  const emoji = a.theme ? THEME_META[a.theme]?.emoji : null;
  const firstLine = a.message.split("\n").find((l) => l.trim()) ?? "";

  return (
    <div role="region" aria-label="Announcement" className="mb-6 flex items-center gap-3 rounded-xl border border-brand/20 bg-brand-soft px-3 py-2 text-sm text-ink sm:px-4">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-brand-ink" aria-hidden>
        {emoji ? <span className="text-sm leading-none">{emoji}</span> : <Icon className="h-3.5 w-3.5" />}
      </span>
      <p className="min-w-0 flex-1 truncate">
        <span className="font-semibold">{a.title}</span>
        {firstLine && firstLine !== a.title && <span className="text-ink-muted"> — {firstLine}</span>}
      </p>
      <Link href={`/announcements?open=${a.id}`} className="shrink-0 text-[13px] font-semibold text-brand hover:underline">
        Read more
      </Link>
      <button
        type="button"
        onClick={() => dismiss.mutate(a.id)}
        aria-label="Dismiss announcement"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-muted hover:bg-brand/10 hover:text-ink"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
