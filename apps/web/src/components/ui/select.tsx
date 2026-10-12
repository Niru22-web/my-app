"use client";

import {
  Children,
  Fragment,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/cn";

interface Opt {
  value: string;
  label: string;
  disabled: boolean;
}

const text = (n: ReactNode): string => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(text).join("");
  if (isValidElement<{ children?: ReactNode }>(n)) return text(n.props.children);
  return "";
};

/** Reads <option> children (through fragments and arrays) so existing call sites keep working unchanged. */
function readOptions(children: ReactNode, out: Opt[] = []): Opt[] {
  Children.forEach(children, (c) => {
    if (!isValidElement<{ children?: ReactNode; value?: string | number; disabled?: boolean }>(c)) return;
    if (c.type === Fragment) return void readOptions(c.props.children, out);
    if (c.type === "option") {
      const label = text(c.props.children);
      out.push({ value: c.props.value != null ? String(c.props.value) : label, label, disabled: !!c.props.disabled });
    }
  });
  return out;
}

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value"> & {
  value?: string | number;
  invalid?: boolean;
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
};

const MENU_MAX = 288;
const SEARCH_AFTER = 8;

/**
 * Branded listbox that replaces the native <select> menu. Same props as <select> with <option>
 * children; onChange receives an event-like object whose target.value is the chosen value.
 */
export const Select = forwardRef<HTMLButtonElement, Props>(function Select(
  { className, invalid, children, value, defaultValue, onChange, disabled, id, name, required, "aria-label": ariaLabel, "aria-describedby": describedBy, hidden },
  ref,
) {
  const options = useMemo(() => readOptions(children), [children]);
  const [inner, setInner] = useState(String(value ?? defaultValue ?? options[0]?.value ?? ""));
  const current = value !== undefined ? String(value) : inner;
  const selected = options.find((o) => o.value === current) ?? options[0];
  const placeholder = !current && !!selected && /^(choose|select|—|-)/i.test(selected.label.trim());

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  const listId = useId();
  const typed = useRef({ text: "", at: 0 });

  const searchable = options.length > SEARCH_AFTER;
  // "Choose…" placeholders show on the closed control but aren't offered as a choice.
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const real = options.filter((o) => !(o.value === "" && /^(choose|select)/i.test(o.label.trim())));
    return q ? real.filter((o) => o.label.toLowerCase().includes(q)) : real;
  }, [options, query]);

  const setRefs = (el: HTMLButtonElement | null) => {
    trigger.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  };

  const place = useCallback(() => {
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 8;
    const above = r.top - 8;
    const width = Math.max(r.width, 200);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    setPos(below >= Math.min(MENU_MAX, 220) || below >= above ? { left, width, top: r.bottom + 4, maxHeight: Math.min(MENU_MAX, below) } : { left, width, bottom: window.innerHeight - r.top + 4, maxHeight: Math.min(MENU_MAX, above) });
  }, []);

  const openMenu = () => {
    if (disabled) return;
    place();
    setQuery("");
    setActive(Math.max(0, shown.findIndex((o) => o.value === current)));
    setOpen(true);
  };
  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  }, []);
  const choose = (o: Opt) => {
    if (o.disabled) return;
    if (value === undefined) setInner(o.value);
    if (o.value !== current) onChange?.({ target: { value: o.value, name }, currentTarget: { value: o.value, name } } as unknown as ChangeEvent<HTMLSelectElement>);
    close();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !trigger.current?.contains(t)) close(false);
    };
    const onScroll = (e: Event) => {
      if (!menu.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
    };
  }, [open, close, place]);

  // Keep the highlighted option in view.
  useEffect(() => {
    if (open) menu.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const move = (delta: number) => {
    if (!shown.length) return;
    let i = active;
    for (let n = 0; n < shown.length; n++) {
      i = (i + delta + shown.length) % shown.length;
      if (!shown[i].disabled) break;
    }
    setActive(i);
  };

  const onMenuKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      move(e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setActive(e.key === "Home" ? 0 : shown.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (shown[active]) choose(shown[active]);
    } else if (e.key === "Escape") {
      // preventDefault tells an enclosing dialog not to close as well.
      e.preventDefault();
      close();
    } else if (e.key === "Tab") close(false);
  };

  const onTriggerKey = (e: KeyboardEvent) => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      openMenu();
      return;
    }
    // Type-ahead while closed, like a native select.
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + e.key.toLowerCase(), at: now };
      const hit = options.find((o) => !o.disabled && o.label.toLowerCase().startsWith(typed.current.text));
      if (hit) choose(hit);
    }
  };

  return (
    <div className={cn("relative", hidden && "hidden", className)}>
      <button
        ref={setRefs}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        aria-required={required || undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onTriggerKey}
        className={cn(
          "flex h-10 w-full items-center gap-2 rounded-xl border bg-surface px-3 text-left text-sm outline-none transition-colors focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-brand/10 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-subtle",
          invalid ? "border-danger" : open ? "border-brand ring-4 ring-brand/10" : "border-line-strong hover:border-ink-subtle/60",
        )}
      >
        <span className={cn("min-w-0 flex-1 truncate", placeholder ? "text-ink-subtle" : "text-ink")}>{selected?.label ?? ""}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-ink-subtle transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {name && <input type="hidden" name={name} value={current} />}

      {open &&
        pos &&
        createPortal(
          <div
            ref={menu}
            style={{ position: "fixed", left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
            className="z-[70] flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
            onKeyDown={onMenuKey}
          >
            {searchable && (
              <div className="relative border-b border-line p-1.5">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" aria-hidden />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => (setQuery(e.target.value), setActive(0))}
                  placeholder="Search…"
                  aria-label="Search options"
                  aria-controls={listId}
                  className="h-8 w-full rounded-lg bg-surface-muted pl-8 pr-2 text-[13px] text-ink outline-none placeholder:text-ink-subtle focus:ring-2 focus:ring-brand/20"
                />
              </div>
            )}
            <ul
              id={listId}
              role="listbox"
              aria-label={ariaLabel}
              tabIndex={searchable ? -1 : 0}
              ref={(el) => {
                if (el && !searchable) el.focus({ preventScroll: true });
              }}
              aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
              className="min-h-0 flex-1 overflow-y-auto p-1 outline-none"
            >
              {shown.map((o, i) => {
                const isSel = o.value === current;
                return (
                  <li
                    key={`${o.value}-${i}`}
                    id={`${listId}-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={isSel}
                    aria-disabled={o.disabled || undefined}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(o)}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13px]",
                      o.disabled ? "cursor-not-allowed text-ink-subtle/60" : i === active ? "bg-brand-softer text-ink" : "text-ink",
                      isSel && "font-semibold text-brand",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{o.label || " "}</span>
                    {isSel && <Check className="h-4 w-4 shrink-0 text-brand" aria-hidden />}
                  </li>
                );
              })}
              {!shown.length && <li className="px-2.5 py-3 text-center text-[13px] text-ink-subtle">No matches</li>}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );
});
