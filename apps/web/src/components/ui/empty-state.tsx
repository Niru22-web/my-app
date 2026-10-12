import type { ReactNode } from "react";
import { Inbox, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/** Shown whenever the API returns nothing — the honest alternative to sample data. */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-10 text-center", className)}>
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-softer text-neutral">
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <p className="mt-3 text-sm font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-ink-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <p className="text-sm font-semibold text-danger">Couldn’t load this section</p>
      <p className="mt-1 max-w-sm text-[13px] text-ink-muted">{message ?? "The server didn’t respond. Please try again."}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-3 text-[13px] font-semibold text-brand hover:underline">
          Retry
        </button>
      )}
    </div>
  );
}
