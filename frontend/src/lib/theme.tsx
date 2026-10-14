"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useLocalValue, useMediaQuery, writeLocal } from "./local-store";

export type ThemeMode = "light" | "dark" | "system";
const KEY = "asa-theme";

interface ThemeCtx {
  mode: ThemeMode;
  resolved: "light" | "dark";
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const stored = useLocalValue(KEY);
  const mode: ThemeMode = stored === "light" || stored === "dark" ? stored : "system";
  const systemDark = useMediaQuery("(prefers-color-scheme: dark)");
  const resolved = mode === "dark" || (mode === "system" && systemDark) ? "dark" : "light";

  // Keep the <html> class in sync (the inline script in the root layout sets it before first paint).
  useEffect(() => {
    if (stored === undefined) return;
    document.documentElement.classList.toggle("dark", resolved === "dark");
  }, [resolved, stored]);

  const setMode = useCallback((m: ThemeMode) => writeLocal(KEY, m), []);
  const toggle = useCallback(() => setMode(resolved === "dark" ? "light" : "dark"), [resolved, setMode]);

  const value = useMemo(() => ({ mode, resolved, setMode, toggle }) as ThemeCtx, [mode, resolved, setMode, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTheme must be used inside ThemeProvider");
  return v;
}
