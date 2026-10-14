"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useDismiss } from "@/lib/use-outside";
import { Avatar } from "./avatar";

export interface PickOption {
  id: string;
  label: string;
  sub?: string;
}

/** Searchable multi-select for people (delivery teams, reporting lines). */
export function PeoplePicker({
  id,
  options,
  value,
  onChange,
  placeholder = "Add people",
  invalid,
  loading,
}: {
  id: string;
  options: PickOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  invalid?: boolean;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const filtered = options.filter((o) => !q.trim() || `${o.label} ${o.sub ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 50);
  const toggle = (oid: string) => onChange(value.includes(oid) ? value.filter((v) => v !== oid) : [...value, oid]);

  return (
    <div ref={ref} className="relative">
      <button
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-describedby={invalid ? `${id}-error` : undefined}
        className={cn(
          "flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-xl border bg-surface px-2.5 py-1.5 text-left text-sm",
          invalid ? "border-danger" : "border-line-strong",
          open && "border-brand ring-4 ring-brand/10",
        )}
      >
        {value.length === 0 && <span className="px-1 text-ink-subtle">{loading ? "Loading…" : placeholder}</span>}
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-lg bg-brand-soft py-0.5 pl-2 pr-1 text-xs font-medium text-brand">
            {byId.get(v)?.label ?? "Unknown"}
            <span
              role="button"
              tabIndex={0}
              aria-label={`Remove ${byId.get(v)?.label ?? ""}`}
              onClick={(e) => (e.stopPropagation(), toggle(v))}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), e.stopPropagation(), toggle(v))}
              className="grid h-4 w-4 place-items-center rounded hover:bg-brand/15"
            >
              <X className="h-3 w-3" />
            </span>
          </span>
        ))}
        <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-ink-subtle" aria-hidden />
      </button>
      {open && (
        // Opens in the document flow (not as an overlay) so it is never clipped inside dialogs.
        <div className="mt-1 overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search className="h-4 w-4 text-ink-subtle" aria-hidden />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search people" className="h-10 flex-1 bg-transparent text-sm text-ink outline-none" />
          </div>
          <ul className="max-h-60 overflow-y-auto p-1" role="listbox" aria-multiselectable>
            {filtered.length === 0 ? (
              <li className="px-3 py-4 text-center text-sm text-ink-subtle">No matches</li>
            ) : (
              filtered.map((o) => {
                const on = value.includes(o.id);
                return (
                  <li key={o.id} role="option" aria-selected={on}>
                    <button type="button" onClick={() => toggle(o.id)} className={cn("flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-surface-muted", on && "bg-brand-softer")}>
                      <input type="checkbox" readOnly checked={on} tabIndex={-1} className="h-4 w-4 accent-[var(--brand)]" />
                      <Avatar name={o.label} size={26} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-ink">{o.label}</span>
                        {o.sub && <span className="block truncate text-xs text-ink-subtle">{o.sub}</span>}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
