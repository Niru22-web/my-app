import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "brand" | "neutral" | "success" | "warning" | "danger";

const tones: Record<Tone, string> = {
  brand: "bg-brand-soft text-brand",
  neutral: "bg-surface-muted text-ink-muted border border-line",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)}>
      {children}
    </span>
  );
}

/** Maps the many status strings used across modules to a consistent badge tone. */
export function statusTone(status: string | null | undefined): Tone {
  const s = (status ?? "").toLowerCase();
  if (/(approved|active|completed|closed|present|paid|resolved|done)/.test(s)) return "success";
  if (/(pending|draft|in.?progress|submitted|open|awaiting|partial)/.test(s)) return "warning";
  if (/(rejected|overdue|absent|expired|failed|cancel|escalat)/.test(s)) return "danger";
  return "neutral";
}
