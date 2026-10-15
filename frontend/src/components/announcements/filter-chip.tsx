"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Chip-button that opens a small multi-select panel (Departments, Roles…). The panel opens in the
 * document flow below the chip row so it is never clipped inside the dialog.
 */
export function FilterChip({
  label,
  icon,
  count,
  open,
  onToggle,
  onClear,
}: {
  label: string;
  icon: ReactNode;
  count: number;
  open: boolean;
  onToggle: () => void;
  onClear: () => void;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center rounded-full border text-[13px] font-medium transition-colors",
        count ? "border-brand bg-brand-soft text-brand" : "border-line-strong bg-surface text-ink hover:bg-surface-muted",
        open && "ring-4 ring-brand/10",
      )}
    >
      <button type="button" onClick={onToggle} aria-expanded={open} className="inline-flex h-full items-center gap-1.5 rounded-full pl-3 pr-2.5 outline-none focus-visible:ring-2 focus-visible:ring-brand">
        {icon}
        {label}
        {count > 0 && <span className="rounded-full bg-brand px-1.5 text-[11px] font-semibold text-brand-ink tabular">{count}</span>}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {count > 0 && (
        <button type="button" onClick={onClear} aria-label={`Clear ${label}`} className="mr-1 grid h-6 w-6 place-items-center rounded-full hover:bg-brand/15">
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </span>
  );
}

export function MultiSelectPanel({
  label,
  options,
  value,
  onChange,
  onClose,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const listId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const shown = options.filter((o) => !q.trim() || o.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter((v) => v !== o) : [...value, o]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && ref.current?.contains(document.activeElement)) {
        e.preventDefault(); // keep the dialog open
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div ref={ref} className="mt-2 overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <div className="flex items-center gap-2 border-b border-line px-3">
        <Search className="h-4 w-4 text-ink-subtle" aria-hidden />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${label.toLowerCase()}`}
          aria-label={`Search ${label.toLowerCase()}`}
          aria-controls={listId}
          className="h-10 flex-1 bg-transparent text-sm text-ink outline-none"
        />
        {value.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="text-xs font-semibold text-brand hover:underline">
            Clear
          </button>
        )}
        <button type="button" onClick={onClose} className="text-xs font-semibold text-ink-muted hover:text-ink">
          Done
        </button>
      </div>
      <ul id={listId} className="max-h-52 overflow-y-auto p-1" role="listbox" aria-multiselectable aria-label={label}>
        {shown.length === 0 ? (
          <li className="px-3 py-4 text-center text-sm text-ink-subtle">{options.length ? "No matches" : "Nothing to choose from"}</li>
        ) : (
          shown.map((o) => {
            const on = value.includes(o);
            return (
              <li key={o} role="option" aria-selected={on}>
                <button type="button" onClick={() => toggle(o)} className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm text-ink hover:bg-surface-muted", on && "bg-brand-softer")}>
                  <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded border", on ? "border-brand bg-brand text-brand-ink" : "border-line-strong")}>
                    {on && <Check className="h-3 w-3" aria-hidden />}
                  </span>
                  <span className="truncate">{o}</span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
