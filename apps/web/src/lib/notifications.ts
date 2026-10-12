"use client";

import { useEffect, useMemo } from "react";
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

  const q = useQuery({
    queryKey: KEY,
    // Snoozed items stay hidden until they wake up (the API returns them regardless); the 30s poll brings them back.
    queryFn: async () => ((await api<Envelope<AppNotification[]>>("notifications", { query: { archived: "false" } })).data ?? []).filter((n) => !isSnoozed(n)),
    enabled,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (!enabled || !user) return;
    const socket = acquireSocket();
    const join = () => socket.emit("join_user_room", user.id);
    if (socket.connected) join();
    socket.on("connect", join);
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

  const items = useMemo(() => q.data ?? [], [q.data]);
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

export function isSnoozed(n: Pick<AppNotification, "snoozedUntil">): boolean {
  return !!n.snoozedUntil && new Date(n.snoozedUntil).getTime() > Date.now();
}
