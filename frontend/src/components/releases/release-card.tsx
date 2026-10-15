"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, Tag } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { TAG_STYLE, TYPE_STYLE, type ItemType, type Release, type ReleaseSection, type ReleaseTag } from "./api";

export function VersionPill({ version }: { version: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface px-2.5 py-0.5 font-mono text-[13px] font-semibold text-ink">
      <Tag className="h-3.5 w-3.5 text-brand" aria-hidden />
      {version}
    </span>
  );
}

export function TagPill({ tag }: { tag: ReleaseTag }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold tracking-wider uppercase", TAG_STYLE[tag])}>{tag}</span>;
}

export function TypePill({ type }: { type: ItemType }) {
  return (
    <span className={cn("inline-flex w-[72px] shrink-0 justify-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold", TYPE_STYLE[type])}>{type}</span>
  );
}

/** One module row: header with item count, expands to the list of changes. */
export function SectionAccordion({ section, open, onToggle, id }: { section: ReleaseSection; open: boolean; onToggle: () => void; id: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface">
      <h4>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={id}
          className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-brand"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="truncate text-sm font-semibold text-ink">{section.module}</span>
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-ink-muted tabular border border-line">
              {section.items.length}
            </span>
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-ink-subtle transition-transform", open && "rotate-180")} aria-hidden />
        </button>
      </h4>
      {open && (
        <ul id={id} className="space-y-2 border-t border-line px-4 py-3">
          {section.items.map((it, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-ink">
              <TypePill type={it.type} />
              <span className="min-w-0 leading-5">{it.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ReleaseCard({
  release,
  latest,
  defaultOpen = 0,
  forceOpen,
  actions,
  sections,
}: {
  release: Pick<Release, "version" | "title" | "summary" | "tags" | "status" | "publishedAt" | "createdAt"> & { sections: ReleaseSection[] };
  latest?: boolean;
  /** How many module rows start expanded. */
  defaultOpen?: number;
  /** Expand every row (e.g. while searching). */
  forceOpen?: boolean;
  actions?: ReactNode;
  /** Sections to show (filtered); defaults to the release's own. */
  sections?: ReleaseSection[];
}) {
  const list = sections ?? release.sections;
  // Rows follow the default (first N open, or all while searching) until the person toggles them.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const isOpen = (m: string) => overrides[m] ?? (!!forceOpen || release.sections.findIndex((s) => s.module === m) < defaultOpen);
  const toggle = (m: string) => setOverrides((cur) => ({ ...cur, [m]: !isOpen(m) }));
  const draft = release.status === "DRAFT";
  const anchor = release.version.replace(/[^A-Za-z0-9.-]/g, "");

  return (
    <article id={release.version} className="scroll-mt-24 rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <VersionPill version={release.version} />
        {latest && <span className="rounded-full bg-success px-2 py-0.5 text-[10.5px] font-bold tracking-wider text-white">LATEST</span>}
        {draft && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[10.5px] font-bold tracking-wider text-warning border border-warning/25">DRAFT</span>}
        {release.tags.map((t) => (
          <TagPill key={t} tag={t} />
        ))}
        <span className="ml-auto text-[13px] text-ink-subtle">
          {release.publishedAt ? formatDate(release.publishedAt, { day: "numeric", month: "long", year: "numeric" }) : `Draft · ${formatDate(release.createdAt)}`}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <h3 className="min-w-0 font-display text-lg font-bold text-ink">{release.title}</h3>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {release.summary && <p className="mt-1.5 max-w-3xl text-sm leading-6 text-ink-muted">{release.summary}</p>}
      {list.length > 0 && (
        <div className="mt-4 space-y-2">
          {list.map((s, i) => (
            <SectionAccordion
              key={s.module + i}
              id={`rel-${anchor}-${i}`}
              section={s}
              open={isOpen(s.module)}
              onToggle={() => toggle(s.module)}
            />
          ))}
        </div>
      )}
    </article>
  );
}
