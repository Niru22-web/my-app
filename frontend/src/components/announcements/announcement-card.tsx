"use client";

import { forwardRef, type ReactNode } from "react";
import { Pin } from "lucide-react";
import { cn } from "@/lib/cn";
import { assetUrl } from "@/lib/api";
import { timeAgo } from "@/lib/notifications";
import { Avatar } from "@/components/ui/avatar";
import { categoryMeta, fmtWhen, THEME_META, type Theme } from "./api";

export function CategoryChip({ category, className }: { category: string; className?: string }) {
  const m = categoryMeta(category);
  const Icon = m.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", m.chip, className)}>
      <Icon className="h-3 w-3" aria-hidden />
      {category}
    </span>
  );
}

export interface CardData {
  title: string;
  message: string;
  category: string;
  pinned?: boolean;
  theme?: Theme | null;
  sentAt?: string | null;
  expiresAt?: string | null;
  sender?: { name: string; designation?: string | null; profileImage?: string | null };
  read?: boolean;
  expired?: boolean;
}

/**
 * One announcement as staff see it. Wishes (they carry a card style) get a festive background.
 * Also used as the live preview in the composer and template editor.
 */
export const AnnouncementCard = forwardRef<HTMLElement, { data: CardData; highlight?: boolean; preview?: boolean; footer?: ReactNode; id?: string }>(function AnnouncementCard(
  { data, highlight, preview, footer, id },
  ref,
) {
  const theme = data.theme ? THEME_META[data.theme] : null;
  const unread = data.read === false;
  return (
    <article
      ref={ref}
      id={id}
      tabIndex={-1}
      aria-label={data.title}
      className={cn(
        "relative overflow-hidden rounded-[var(--radius-card)] border p-5 shadow-card outline-none transition-shadow",
        theme ? theme.card : "border-line bg-surface",
        highlight && "ring-4 ring-brand/30",
      )}
    >
      {theme && (
        <span aria-hidden className="pointer-events-none absolute -right-2 -top-3 select-none text-6xl opacity-20">
          {theme.emoji}
        </span>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <CategoryChip category={data.category} />
        {data.pinned && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-muted">
            <Pin className="h-3 w-3" aria-hidden /> Pinned
          </span>
        )}
        {data.expired && <span className="text-[11px] font-medium text-ink-subtle">Expired</span>}
        {unread && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand">
            <span className="h-2 w-2 rounded-full bg-brand" aria-hidden /> New
          </span>
        )}
      </div>
      <h3 className={cn("mt-3 font-display text-lg font-bold leading-snug text-ink", theme?.accent)}>{data.title || (preview ? "Your title" : "")}</h3>
      <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-ink">{data.message || (preview ? "Your message will appear here." : "")}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2.5 text-xs text-ink-muted">
        {data.sender && (
          <>
            <Avatar name={data.sender.name} src={assetUrl(data.sender.profileImage)} size={24} />
            <span className="font-medium text-ink">{data.sender.name}</span>
            {data.sender.designation && <span className="text-ink-subtle">· {data.sender.designation}</span>}
          </>
        )}
        {data.sentAt && (
          <time dateTime={data.sentAt} title={fmtWhen(data.sentAt)} className="ml-auto text-ink-subtle">
            {timeAgo(data.sentAt)}
          </time>
        )}
        {preview && !data.sentAt && <span className="ml-auto text-ink-subtle">Just now</span>}
      </div>
      {footer}
    </article>
  );
});
