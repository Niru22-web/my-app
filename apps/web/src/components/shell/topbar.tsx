"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, CheckCheck, LogOut, Menu, Moon, PanelLeft, Sun, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { useNotifications, timeAgo } from "@/lib/notifications";
import { useDismiss } from "@/lib/use-outside";
import { pageTitle } from "@/lib/nav";
import { roleLabel } from "@/lib/roles";
import { assetUrl } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/avatar";
import { GlobalSearch } from "./search";

const iconBtn =
  "relative grid h-10 w-10 place-items-center rounded-xl text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink";

export function Topbar({ onToggleSidebar, onOpenMobile }: { onToggleSidebar: () => void; onOpenMobile: () => void }) {
  const pathname = usePathname();
  const { resolved, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-20 flex h-[72px] items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-surface/80 sm:px-6">
      <button onClick={onOpenMobile} className={cn(iconBtn, "lg:hidden")} aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </button>
      <button onClick={onToggleSidebar} className={cn(iconBtn, "hidden lg:grid")} aria-label="Collapse sidebar">
        <PanelLeft className="h-5 w-5" />
      </button>

      <h1 className="min-w-0 flex-1 truncate font-display text-lg font-bold text-ink">{pageTitle(pathname)}</h1>

      <div className="flex items-center gap-1.5">
        <GlobalSearch />
        <button onClick={toggle} className={cn(iconBtn, "hidden sm:grid")} aria-label={resolved === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
          {resolved === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
        <NotificationMenu />
        <UserMenu />
      </div>
    </header>
  );
}

function NotificationMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  const { items, unread, loading, markRead, markAllRead } = useNotifications();
  const router = useRouter();
  const visible = items.filter((n) => !n.isArchived).slice(0, 12);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className={iconBtn} aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={open}>
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 min-w-[18px] rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-[18px] text-white tabular">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-12 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-display text-sm font-bold text-ink">Notifications</p>
            {unread > 0 && (
              <button onClick={() => markAllRead()} className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {loading ? (
              <p className="px-4 py-8 text-center text-sm text-ink-subtle">Loading…</p>
            ) : visible.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-subtle">You’re all caught up.</p>
            ) : (
              visible.map((n, i) => (
                <button
                  key={n.id ?? `tmp-${i}`}
                  onClick={() => {
                    if (n.id && !n.isRead) markRead(n.id);
                    setOpen(false);
                    if (n.actionUrl) {
                      if (n.actionUrl.startsWith("/")) router.push(n.actionUrl);
                      else window.location.href = n.actionUrl;
                    }
                  }}
                  className={cn(
                    "flex w-full gap-3 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-surface-muted",
                    !n.isRead && "bg-brand-softer",
                  )}
                >
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.isRead ? "bg-transparent" : "bg-brand")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    {n.title && n.title !== "Notification" && <span className="block text-[13px] font-semibold text-ink">{n.title}</span>}
                    <span className="line-clamp-2 block text-[13px] text-ink-muted">{n.message}</span>
                    <span className="mt-1 block text-[11px] text-ink-subtle">{timeAgo(n.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
          <Link href="/inbox" onClick={() => setOpen(false)} className="block border-t border-line px-4 py-2.5 text-center text-[13px] font-semibold text-brand hover:bg-surface-muted">
            Open inbox
          </Link>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  const { user, logout } = useAuth();
  const { mode, setMode } = useTheme();

  return (
    <div ref={ref} className="relative ml-1">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2.5 rounded-xl p-1 pr-2 hover:bg-surface-muted" aria-expanded={open} aria-label="Account menu">
        <Avatar name={user?.name} src={assetUrl(user?.profileImage)} size={36} />
        <span className="hidden text-left xl:block">
          <span className="block max-w-[140px] truncate text-[13px] font-semibold text-ink">{user?.name}</span>
          <span className="block text-[11px] text-ink-subtle">{roleLabel(user?.role)}</span>
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-12 w-[260px] overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-sm font-semibold text-ink">{user?.name}</p>
            <p className="truncate text-xs text-ink-subtle">{user?.email}</p>
          </div>
          <div className="p-1.5">
            <Link href="/portal/profile" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink hover:bg-surface-muted">
              <UserRound className="h-4 w-4 text-ink-muted" /> My profile
            </Link>
          </div>
          <div className="border-t border-line px-4 py-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">Appearance</p>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-surface-muted p-1">
              {(["light", "dark", "system"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    "rounded-md py-1 text-xs font-medium capitalize",
                    mode === m ? "bg-surface text-brand shadow-sm" : "text-ink-muted hover:text-ink",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="border-t border-line p-1.5">
            <button onClick={() => logout()} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger-soft">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
