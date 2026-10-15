"use client";

import { useState, type ReactNode } from "react";
import { Bug as BugIcon, Check, Copy, ExternalLink, Lightbulb, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/inputs";
import { useToast } from "@/components/ui/toast";
import { assetUrl } from "@/lib/api";
import { roleLabel } from "@/lib/roles";
import { PRIORITY_TONE, STATUS_COLOR, type BugPerson } from "./api";

export function StatusDot({ status, className }: { status: string; className?: string }) {
  return <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", className)} style={{ background: STATUS_COLOR[status] ?? "var(--chart-previous)" }} aria-hidden />;
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs font-semibold text-ink">
      <StatusDot status={status} />
      {status}
    </span>
  );
}

export function PriorityChip({ priority }: { priority: string }) {
  return <Badge tone={PRIORITY_TONE[priority] ?? "neutral"}>{priority}</Badge>;
}

const TYPE_ICON = { Bug: BugIcon, Feature: Lightbulb, Enhancement: TrendingUp } as const;
export function TypeChip({ type }: { type: string }) {
  const Icon = TYPE_ICON[type as keyof typeof TYPE_ICON] ?? BugIcon;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-ink-muted">
      <Icon className={cn("h-3 w-3", type === "Bug" ? "text-danger" : type === "Feature" ? "text-warning" : "text-success")} aria-hidden />
      {type}
    </span>
  );
}

export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-ink-muted", className)}>{children}</span>;
}

export function EnvChip({ env }: { env: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide", env === "Live" ? "bg-danger-soft text-danger" : "bg-brand-soft text-brand")}>
      {env}
    </span>
  );
}

export function ExtRefChip({ value }: { value: string }) {
  return (
    <Chip className="font-mono">
      <ExternalLink className="h-3 w-3" aria-hidden />
      {value}
    </Chip>
  );
}

/** Ticket code with a copy-to-clipboard button. */
export function CopyCode({ code, className }: { code: string; className?: string }) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span className="font-mono text-xs font-semibold text-brand">{code}</span>
      <button
        type="button"
        aria-label={`Copy ${code}`}
        title="Copy ID"
        onClick={(e) => {
          e.stopPropagation();
          navigator.clipboard
            ?.writeText(code)
            .then(() => {
              setDone(true);
              setTimeout(() => setDone(false), 1500);
            })
            .catch(() => toast.error("Couldn’t copy", "Your browser blocked the clipboard."));
        }}
        className="grid h-5 w-5 place-items-center rounded text-ink-subtle hover:bg-surface-muted hover:text-ink"
      >
        {done ? <Check className="h-3 w-3 text-success" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
      </button>
    </span>
  );
}

export function PersonChip({ person, sub, size = 24 }: { person: BugPerson | null; sub?: ReactNode; size?: number }) {
  if (!person) return <span className="text-sm italic text-ink-subtle">Unassigned</span>;
  const subText = sub === undefined ? person.designation || roleLabel(person.role) : sub;
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Avatar name={person.name} src={assetUrl(person.profileImage)} size={size} />
      <span className="min-w-0 text-left">
        <span className="block truncate text-sm font-medium text-ink">{person.name}</span>
        {subText && <span className="block truncate text-[11px] text-ink-subtle">{subText}</span>}
      </span>
    </span>
  );
}

/** Compact select for table cells/cards; stops clicks reaching the row. */
export function InlineSelect({
  value,
  onChange,
  label,
  children,
  className,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className={cn("[&_button[role=combobox]]:h-8 [&_button[role=combobox]]:rounded-lg [&_button[role=combobox]]:text-xs", className)}>
      <Select aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {children}
      </Select>
    </div>
  );
}
