"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

type Tone = "success" | "error" | "info";
interface ToastItem {
  id: number;
  tone: Tone;
  title: string;
  description?: string;
}

const Ctx = createContext<((t: Omit<ToastItem, "id">) => void) | null>(null);
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (t: Omit<ToastItem, "id">) => {
      const id = ++seq;
      setItems((xs) => [...xs.slice(-3), { ...t, id }]);
      setTimeout(() => dismiss(id), t.tone === "error" ? 7000 : 4000);
    },
    [dismiss],
  );

  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
        {items.map((t) => {
          const Icon = t.tone === "success" ? CheckCircle2 : t.tone === "error" ? XCircle : Info;
          return (
            <div key={t.id} role={t.tone === "error" ? "alert" : "status"} className="pointer-events-auto flex gap-3 rounded-2xl border border-line bg-surface p-4 shadow-pop">
              <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", t.tone === "success" ? "text-success" : t.tone === "error" ? "text-danger" : "text-brand")} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{t.title}</p>
                {t.description && <p className="mt-0.5 text-[13px] text-ink-muted">{t.description}</p>}
              </div>
              <button onClick={() => dismiss(t.id)} className="h-6 w-6 shrink-0 text-ink-subtle hover:text-ink" aria-label="Dismiss">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const push = useContext(Ctx);
  if (!push) throw new Error("useToast must be used inside ToastProvider");
  return useMemo(
    () => ({
      success: (title: string, description?: string) => push({ tone: "success", title, description }),
      error: (title: string, description?: string) => push({ tone: "error", title, description }),
      info: (title: string, description?: string) => push({ tone: "info", title, description }),
    }),
    [push],
  );
}
