import type { HTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-[var(--radius-card)] border border-line bg-surface shadow-card", className)}
      {...props}
    />
  );
}

interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string;
}

/** Standard section heading inside a card: icon, title, optional subtitle and actions. */
export function CardHeader({ title, description, icon: Icon, actions, className }: CardHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 px-5 pt-5", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
            <Icon className="h-[18px] w-[18px]" aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="font-display text-[15px] font-bold leading-6 text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] text-ink-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Module card with the solid brand header band used on the dashboard. */
export function ModuleCard({
  title,
  icon: Icon,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("flex flex-col overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-3 bg-brand px-5 py-3 text-brand-ink dark:bg-brand-soft dark:text-ink">
        <div className="flex items-center gap-2.5">
          {Icon && (
            <span className="grid h-7 w-7 place-items-center rounded-full bg-white/15">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
          )}
          <h2 className="font-display text-[15px] font-semibold">{title}</h2>
        </div>
        {actions}
      </div>
      <div className="flex flex-1 flex-col p-5">{children}</div>
    </Card>
  );
}
