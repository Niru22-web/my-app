"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";
import { roleInfo, roleLabel } from "@/lib/roles";
import { buildNav, isActive } from "@/lib/nav";
import { useNotifications } from "@/lib/notifications";
import { assetUrl } from "@/lib/api";
import { Logo, LogoMark } from "@/components/brand/logo";
import { Avatar } from "@/components/ui/avatar";

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ collapsed, mobileOpen, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { can } = usePermissions();
  const { unread } = useNotifications();
  const sections = buildNav(roleInfo(user?.role), can);

  // On mobile the drawer is always shown expanded.
  const content = (compact: boolean) => (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-[72px] shrink-0 items-center border-b border-line", compact ? "justify-center px-2" : "px-6")}>
        <Link href="/dashboard" aria-label="ASA Portal home" className="flex items-center">
          {compact ? <LogoMark size={38} eager /> : <Logo priority className="w-[150px]" />}
        </Link>
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section) => (
          <div key={section.title} className="mb-5 last:mb-0">
            {!compact && (
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
                {section.title}
              </p>
            )}
            {compact && <div className="mx-auto mb-2 h-px w-6 bg-line first:hidden" aria-hidden />}
            <ul className="space-y-1">
              {section.items.map((item) => {
                const active = isActive(item, pathname);
                const Icon = item.icon;
                const count = item.badge === "unread" ? unread : 0;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onCloseMobile}
                      title={compact ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-xl text-[14px] font-medium transition-colors",
                        compact ? "h-11 justify-center" : "h-11 px-3",
                        active
                          ? "bg-brand text-brand-ink shadow-sm"
                          : "text-ink-muted hover:bg-brand-softer hover:text-brand dark:hover:text-ink",
                      )}
                    >
                      <Icon className="h-[19px] w-[19px] shrink-0" aria-hidden />
                      {!compact && <span className="truncate">{item.label}</span>}
                      {count > 0 &&
                        (compact ? (
                          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-danger" aria-label={`${count} unread`} />
                        ) : (
                          <span
                            className={cn(
                              "ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold tabular",
                              active ? "bg-white/20" : "bg-danger text-white",
                            )}
                          >
                            {count > 99 ? "99+" : count}
                          </span>
                        ))}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className={cn("shrink-0 border-t border-line p-3", compact && "flex flex-col items-center gap-2")}>
        {compact ? (
          <>
            <Link href="/portal/profile" title={user?.name} onClick={onCloseMobile}>
              <Avatar name={user?.name} src={assetUrl(user?.profileImage)} size={36} />
            </Link>
            <button
              onClick={() => logout()}
              title="Sign out"
              className="grid h-10 w-10 place-items-center rounded-xl text-ink-muted hover:bg-danger-soft hover:text-danger"
            >
              <LogOut className="h-[18px] w-[18px]" aria-hidden />
              <span className="sr-only">Sign out</span>
            </button>
          </>
        ) : (
          <div className="flex items-center gap-3 rounded-xl bg-surface-muted p-2.5">
            <Link href="/portal/profile" onClick={onCloseMobile} className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar name={user?.name} src={assetUrl(user?.profileImage)} size={36} />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-ink">{user?.name}</span>
                <span className="block truncate text-[11px] text-ink-subtle">{roleLabel(user?.role)}</span>
              </span>
            </Link>
            <button
              onClick={() => logout()}
              title="Sign out"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-muted hover:bg-danger-soft hover:text-danger"
            >
              <LogOut className="h-[17px] w-[17px]" aria-hidden />
              <span className="sr-only">Sign out</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden border-r border-line bg-surface transition-[width] duration-200 lg:block",
          collapsed ? "w-[84px]" : "w-[264px]",
        )}
      >
        {content(collapsed)}
      </aside>

      {/* Mobile drawer */}
      <div
        className={cn("fixed inset-0 z-40 lg:hidden", mobileOpen ? "pointer-events-auto" : "pointer-events-none")}
        aria-hidden={!mobileOpen}
      >
        <div
          onClick={onCloseMobile}
          className={cn("absolute inset-0 bg-ink/40 transition-opacity", mobileOpen ? "opacity-100" : "opacity-0")}
        />
        <aside
          className={cn(
            "absolute inset-y-0 left-0 w-[280px] max-w-[85vw] bg-surface shadow-pop transition-transform duration-200",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <button
            onClick={onCloseMobile}
            className="absolute right-3 top-5 grid h-9 w-9 place-items-center rounded-lg text-ink-muted hover:bg-surface-muted"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
          {content(false)}
        </aside>
      </div>
    </>
  );
}
