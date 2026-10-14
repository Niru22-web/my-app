"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, TOKEN_KEY, USER_KEY } from "./api";
import { readLocal, useLocalValue, writeLocal } from "./local-store";
import type { AuthUser, LoginResponse } from "./types";

type Status = "loading" | "authenticated" | "anonymous";

interface AuthCtx {
  status: Status;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: (reason?: "expired" | "inactive" | "password") => void;
  /** Merge fresh fields into the signed-in user (e.g. after a photo change). */
  patchUser: (patch: Partial<AuthUser>) => void;
}

const Ctx = createContext<AuthCtx | null>(null);

// Matches the legacy portal's security policy.
const INACTIVITY_MS = 15 * 60 * 1000;

function parseUser(raw: string | null | undefined): AuthUser | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const rawUser = useLocalValue(USER_KEY);
  const rawToken = useLocalValue(TOKEN_KEY);
  const qc = useQueryClient();

  const user = useMemo(() => parseUser(rawUser), [rawUser]);
  const status: Status = rawUser === undefined ? "loading" : user && rawToken ? "authenticated" : "anonymous";

  const logout = useCallback(
    (reason?: "expired" | "inactive" | "password") => {
      writeLocal(TOKEN_KEY, null);
      writeLocal(USER_KEY, null);
      qc.clear();
      window.location.assign(reason ? `/login?reason=${reason}` : "/login");
    },
    [qc],
  );

  // Verify the stored session once per load and refresh profile fields (department, position, photo).
  const verified = useRef(false);
  useEffect(() => {
    if (status !== "authenticated" || verified.current) return;
    verified.current = true;
    api<AuthUser>("auth/me")
      .then((me) => {
        const current = parseUser(readLocal(USER_KEY));
        if (current) writeLocal(USER_KEY, JSON.stringify({ ...current, ...me }));
      })
      .catch(() => {
        /* a 401 triggers the session-expired handler; other errors keep the cached profile */
      });
  }, [status]);

  useEffect(() => {
    const onExpired = () => logout("expired");
    window.addEventListener("asa:session-expired", onExpired);
    return () => window.removeEventListener("asa:session-expired", onExpired);
  }, [logout]);

  // Sign out after a period of inactivity.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (status !== "authenticated") return;
    const reset = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => logout("inactive"), INACTIVITY_MS);
    };
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      if (timer.current) clearTimeout(timer.current);
    };
  }, [status, logout]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<LoginResponse>("auth/login", {
      method: "POST",
      body: { email: email.trim().toLowerCase(), password },
      anonymous: true,
    });
    verified.current = true;
    writeLocal(TOKEN_KEY, res.token);
    writeLocal(USER_KEY, JSON.stringify(res.user));
    return res.user;
  }, []);

  const patchUser = useCallback((patch: Partial<AuthUser>) => {
    const current = parseUser(readLocal(USER_KEY));
    if (current) writeLocal(USER_KEY, JSON.stringify({ ...current, ...patch }));
  }, []);

  const value = useMemo(() => ({ status, user, login, logout, patchUser }), [status, user, login, logout, patchUser]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
