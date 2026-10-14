import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { Skeleton } from "./skeleton";

type Tone = "brand" | "neutral" | "success" | "warning" | "danger";

const toneText: Record<Tone, string> = {
  brand: "text-brand",
  neutral: "text-ink",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};
const toneIcon: Record<Tone, string> = {
  brand: "bg-brand-soft text-brand",
  neutral: "bg-surface-muted text-ink-muted",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  /** Short context shown under/next to the value, e.g. "of 42 employees". Must be real data. */
  hint?: ReactNode;
  loading?: boolean;
  className?: string;
}

/** KPI tile. When loading, shows a skeleton — never a placeholder number. */
export function StatCard({ label, value, icon: Icon, tone = "neutral", hint, loading, className }: StatCardProps) {
  return (
    <div className={cn("rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card", className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-medium text-ink-muted">{label}</p>
        {Icon && (
          <span className={cn("grid h-9 w-9 place-items-center rounded-xl", toneIcon[tone])}>
            <Icon className="h-[18px] w-[18px]" aria-hidden />
          </span>
        )}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <p className={cn("font-display text-[28px] font-bold leading-none tabular", toneText[tone])}>{value}</p>
        )}
        {hint && !loading && <p className="text-right text-xs text-ink-subtle">{hint}</p>}
      </div>
    </div>
  );
}

/** Compact label/value tile used inside module cards. */
export function MiniStat({ label, value, loading }: { label: string; value: ReactNode; loading?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface-muted px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-20" />
      ) : (
        <p className="mt-1 font-display text-2xl font-bold text-brand tabular">{value}</p>
      )}
    </div>
  );
}

/** A labelled row with a coloured status dot, as used in module card breakdowns. */
export function StatRow({ label, value, tone = "brand" }: { label: string; value: ReactNode; tone?: Tone | "muted" }) {
  const dot =
    tone === "muted"
      ? "bg-neutral"
      : tone === "brand"
        ? "bg-brand"
        : tone === "success"
          ? "bg-success"
          : tone === "warning"
            ? "bg-warning"
            : tone === "danger"
              ? "bg-danger"
              : "bg-ink";
  return (
    <div className="flex items-center justify-between gap-3 border-b border-dashed border-line py-2.5 last:border-0">
      <span className="flex items-center gap-2 text-sm text-ink-muted">
        <span className={cn("h-1.5 w-1.5 rounded-full", dot)} aria-hidden />
        {label}
      </span>
      <span className="text-sm font-semibold text-ink tabular">{value}</span>
    </div>
  );
}
