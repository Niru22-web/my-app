"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  /** Shown greyed out with this explanation instead of hidden. */
  disabledReason?: string;
}

const WIDTH = 240;

/**
 * Compact "⋯" action menu for table rows. Rendered in a portal with fixed positioning so
 * scrolling table containers never clip it; opens upward when there's no room below.
 */
export function RowMenu({ items, label = "Actions" }: { items: MenuItem[]; label?: string }) {
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setPos(null), []);

  useEffect(() => {
    if (!pos) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !btn.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [pos, close]);

  if (!items.length) return null;

  const open = () => {
    const r = btn.current!.getBoundingClientRect();
    const estimate = items.length * 44 + 12;
    const left = Math.max(8, Math.min(window.innerWidth - WIDTH - 8, r.right - WIDTH));
    setPos(window.innerHeight - r.bottom < estimate && r.top > estimate ? { bottom: window.innerHeight - r.top + 4, left } : { top: r.bottom + 4, left });
  };

  return (
    <div className="inline-block" onClick={(e) => e.stopPropagation()}>
      <button
        ref={btn}
        onClick={() => (pos ? close() : open())}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={!!pos}
        className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {pos &&
        createPortal(
          <div ref={menu} role="menu" style={{ position: "fixed", width: WIDTH, ...pos }} className="z-50 rounded-xl border border-line bg-surface p-1 text-left shadow-pop" onClick={(e) => e.stopPropagation()}>
            {items.map((it) => (
              <button
                key={it.label}
                role="menuitem"
                disabled={!!it.disabledReason}
                onClick={() => (close(), it.onClick())}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] disabled:cursor-not-allowed",
                  it.danger ? "text-danger hover:bg-danger-soft" : "text-ink hover:bg-surface-muted",
                  it.disabledReason && "opacity-60 hover:bg-transparent",
                )}
              >
                <span className="mt-0.5 shrink-0">{it.icon}</span>
                <span>
                  {it.label}
                  {it.disabledReason && <span className="block text-[11px] text-ink-subtle">{it.disabledReason}</span>}
                </span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
