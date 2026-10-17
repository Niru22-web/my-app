import type { ReactNode } from "react";
import Link from "next/link";
import { Inbox, Lock, type LucideIcon } from "lucide-react";
import { ApiError } from "@/lib/api";
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

/** Pass `error` (the query error) so a 403 reads as "no access" instead of a failure with a pointless Retry. */
export function ErrorState({ message, onRetry, error }: { message?: string; onRetry?: () => void; error?: unknown }) {
  if (error instanceof ApiError && error.status === 403)
    return (
      <EmptyState
        icon={Lock}
        title="You don’t have access to this page"
        description={error.message || "Ask an administrator if you think you should."}
        action={
          <Link href="/dashboard" className="text-[13px] font-semibold text-brand hover:underline">
            Go to my dashboard
          </Link>
        }
      />
    );
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
