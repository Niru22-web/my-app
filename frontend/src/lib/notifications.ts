"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { useAuth } from "./auth";
import { acquireSocket, releaseSocket } from "./socket";
import type { AppNotification, Envelope } from "./types";

const KEY = ["notifications"];

export function useNotifications() {
  const { user, status } = useAuth();
  const qc = useQueryClient();
  const enabled = status === "authenticated" && !!user;

  // New notifications arrive over the socket, so there's no fast polling. The slow poll is only a safety net
  // (e.g. a dropped socket), and a reconnect refetches straight away to pick up anything missed meanwhile.
  const q = useQuery({
    queryKey: KEY,
    queryFn: async () => (await api<Envelope<AppNotification[]>>("notifications", { query: { archived: "false" } })).data ?? [],
    enabled,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
  });

  // Snoozed items are kept in the cache and hidden until they wake; a local clock re-checks every minute
  // (no request needed).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !user) return;
    const socket = acquireSocket();
    const join = () => socket.emit("join_user_room", user.id);
    if (socket.connected) join();
    socket.on("connect", join);
    const onReconnect = () => void qc.invalidateQueries({ queryKey: KEY });
    socket.io.on("reconnect", onReconnect);
    const onNotification = (n: AppNotification) => {
      qc.setQueryData<AppNotification[]>(KEY, (prev = []) => {
        // Some server events (IT tickets) arrive without an id — refetch to get the stored copy.
        if (!n.id) {
          void qc.invalidateQueries({ queryKey: KEY });
          return [{ ...n, isRead: false }, ...prev];
        }
        return prev.some((p) => p.id === n.id) ? prev : [{ ...n, isRead: false }, ...prev];
      });
    };
    socket.on("new_notification", onNotification);
    return () => {
      socket.off("connect", join);
      socket.io.off("reconnect", onReconnect);
      socket.off("new_notification", onNotification);
      releaseSocket();
    };
  }, [enabled, user, qc]);

  const markRead = useMutation({
    mutationFn: (id: string) => api(`notifications/${id}`, { method: "PATCH", body: { isRead: true } }),
    onMutate: (id) =>
      qc.setQueryData<AppNotification[]>(KEY, (prev = []) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))),
  });

  const markAllRead = useMutation({
    mutationFn: () => api("notifications/read-all", { method: "PATCH" }),
    onMutate: () => qc.setQueryData<AppNotification[]>(KEY, (prev = []) => prev.map((n) => ({ ...n, isRead: true }))),
  });

  const items = useMemo(() => (q.data ?? []).filter((n) => !isSnoozed(n, now)), [q.data, now]);
  const unread = useMemo(() => items.filter((n) => !n.isRead && !n.isArchived).length, [items]);

  return { items, unread, loading: q.isLoading, error: q.error, markRead: markRead.mutate, markAllRead: markAllRead.mutate };
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export function isSnoozed(n: Pick<AppNotification, "snoozedUntil">, now = Date.now()): boolean {
  return !!n.snoozedUntil && new Date(n.snoozedUntil).getTime() > now;
}
