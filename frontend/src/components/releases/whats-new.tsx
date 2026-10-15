"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { plural } from "@/lib/format";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { itemCount, type Release } from "./api";
import { TagPill, TypePill, VersionPill } from "./release-card";

const TOP = 6;

/**
 * "What's new" prompt: shows the newest published release once per person.
 * Mount it once in the portal layout.
 */
export function WhatsNewPrompt() {
  const { status } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [dismissed, setDismissed] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["releases-unseen"],
    enabled: status === "authenticated",
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: async () => (await api<{ data: Release | null }>("releases/latest-unseen")).data,
  });
  const seen = useMutation({
    mutationFn: (id: string) => api(`releases/${id}/seen`, { method: "POST" }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["releases-unseen"] }),
  });

  const r = q.data;
  if (!r || dismissed === r.id) return null;

  const items = r.sections.flatMap((s) => s.items.map((it) => ({ ...it, module: s.module })));
  const top = items.slice(0, TOP);
  const more = itemCount(r) - top.length;

  const close = (goTo?: string) => {
    setDismissed(r.id);
    seen.mutate(r.id);
    if (goTo) router.push(goTo);
  };

  return (
    <Dialog
      open
      onClose={() => close()}
      title={`What’s new in ${r.version}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => close(`/releases#${r.version}`)}>
            See all changes
          </Button>
          <Button onClick={() => close()}>Got it</Button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-soft text-brand">
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
        <VersionPill version={r.version} />
        {r.tags.map((t) => (
          <TagPill key={t} tag={t} />
        ))}
      </div>
      <h3 className="mt-3 font-display text-lg font-bold text-ink">{r.title}</h3>
      {r.summary && <p className="mt-1 text-sm leading-6 text-ink-muted">{r.summary}</p>}
      <ul className="mt-4 space-y-2.5">
        {top.map((it, i) => (
          <li key={i} className="flex items-start gap-3 text-sm">
            <TypePill type={it.type} />
            <span className="min-w-0 leading-5 text-ink">
              {it.text} <span className="text-ink-subtle">· {it.module}</span>
            </span>
          </li>
        ))}
      </ul>
      {more > 0 && <p className="mt-3 text-[13px] text-ink-muted">…and {plural(more, "more change")}.</p>}
    </Dialog>
  );
}
