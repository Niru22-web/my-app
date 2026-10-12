import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  trailing?: ReactNode;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ label, error, trailing, id, className, ...props }, ref) {
  const fid = id ?? props.name;
  return (
    <div className={className}>
      <label htmlFor={fid} className="mb-1.5 block text-[13px] font-medium text-ink">
        {label}
      </label>
      <div
        className={cn(
          "flex h-11 items-center rounded-xl border bg-surface transition-colors focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10",
          error ? "border-danger" : "border-line-strong",
        )}
      >
        <input
          ref={ref}
          id={fid}
          aria-invalid={!!error}
          aria-describedby={error ? `${fid}-error` : undefined}
          className="h-full min-w-0 flex-1 bg-transparent px-3.5 text-[15px] text-ink outline-none placeholder:text-ink-subtle"
          {...props}
        />
        {trailing}
      </div>
      {error && (
        <p id={`${fid}-error`} className="mt-1.5 text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
});
