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
/** Last time the person used any portal tab (ms since epoch), shared across tabs. */
const ACTIVITY_KEY = "lastActivity";

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
    // The API answers { success, user }.
    api<{ user?: Partial<AuthUser> }>("auth/me")
      .then((res) => {
        const current = parseUser(readLocal(USER_KEY));
        if (current && res?.user) writeLocal(USER_KEY, JSON.stringify({ ...current, ...res.user }));
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

  // Sign out after a period of inactivity. The sign-in is shared by every open portal tab, so activity is
  // too: the last-activity time lives in localStorage, and an idle background tab no longer signs out a
  // person who is busy in another tab.
  useEffect(() => {
    if (status !== "authenticated") return;
    let lastWrite = 0;
    const touch = () => {
      const now = Date.now();
      if (now - lastWrite < 5_000) return; // mousemove fires constantly; a few seconds' precision is plenty
      lastWrite = now;
      try {
        localStorage.setItem(ACTIVITY_KEY, String(now)); // quiet write: nothing renders from this key
      } catch {
        /* storage unavailable — this tab's own lastWrite still counts */
      }
    };
    const check = () => {
      const last = Number(readLocal(ACTIVITY_KEY)) || lastWrite;
      if (Date.now() - last >= INACTIVITY_MS) logout("inactive");
    };
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    touch();
    const interval = setInterval(check, 30_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch));
      clearInterval(interval);
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
