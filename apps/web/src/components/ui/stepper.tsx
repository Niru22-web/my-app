import { Check, X } from "lucide-react";
import { cn } from "@/lib/cn";

export interface Step {
  label: string;
  /** Who acted / when — shown under the label. */
  detail?: string | null;
  state: "done" | "current" | "upcoming" | "failed";
}

/** Horizontal approval progress (Submitted → Manager → Finance → Paid). Stacks vertically on phones. */
export function Stepper({ steps, className }: { steps: Step[]; className?: string }) {
  return (
    <ol className={cn("flex flex-col gap-3 sm:flex-row sm:gap-0", className)}>
      {steps.map((s, i) => (
        <li key={s.label} className="flex flex-1 items-start gap-3 sm:flex-col sm:items-center sm:gap-1.5 sm:text-center">
          <div className="flex items-center sm:w-full">
            <span className={cn("hidden h-0.5 flex-1 sm:block", i === 0 ? "bg-transparent" : steps[i - 1].state === "done" ? "bg-brand" : "bg-line")} aria-hidden />
            <span
              className={cn(
                "grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 text-xs font-bold",
                s.state === "done" && "border-brand bg-brand text-brand-ink",
                s.state === "current" && "border-brand bg-surface text-brand",
                s.state === "upcoming" && "border-line bg-surface text-ink-subtle",
                s.state === "failed" && "border-danger bg-danger text-white",
              )}
              aria-hidden
            >
              {s.state === "done" ? <Check className="h-3.5 w-3.5" /> : s.state === "failed" ? <X className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={cn("hidden h-0.5 flex-1 sm:block", i === steps.length - 1 ? "bg-transparent" : s.state === "done" ? "bg-brand" : "bg-line")} aria-hidden />
          </div>
          <div className="min-w-0">
            <p className={cn("text-[13px] font-semibold", s.state === "upcoming" ? "text-ink-subtle" : s.state === "failed" ? "text-danger" : "text-ink")}>
              {s.label}
              <span className="sr-only">
                {" "}
                — {s.state === "done" ? "completed" : s.state === "current" ? "in progress" : s.state === "failed" ? "rejected" : "not started"}
              </span>
            </p>
            {s.detail && <p className="text-xs text-ink-subtle">{s.detail}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
