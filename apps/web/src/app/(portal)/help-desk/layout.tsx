"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { isCategoryAdmin } from "@/components/helpdesk/api";

export default function HelpDeskLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const tabs = [
    { href: "/help-desk", label: "Tickets", active: pathname === "/help-desk" || /^\/help-desk\/(?!categories)/.test(pathname) },
    ...(isCategoryAdmin(user?.role) ? [{ href: "/help-desk/categories", label: "Categories & routing", active: pathname.startsWith("/help-desk/categories") }] : []),
  ];
  return (
    <div className="space-y-6">
      {tabs.length > 1 && (
        <nav aria-label="Help desk sections" className="flex gap-6 border-b border-line">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              aria-current={t.active ? "page" : undefined}
              className={cn("-mb-px border-b-2 pb-3 text-sm font-semibold transition-colors", t.active ? "border-brand text-brand" : "border-transparent text-ink-muted hover:text-ink")}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      )}
      {children}
    </div>
  );
}
