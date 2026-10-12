"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";
import { normRole } from "@/lib/roles";
import { cn } from "@/lib/cn";

export default function PortalSectionLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { can } = usePermissions();
  const reports = ["admin", "owner", "hr", "it", "manager", "partner"].includes(normRole(user?.role)) || can("reports");

  const tabs = [
    { href: "/portal/profile", label: "Profile" },
    { href: "/portal/leaves", label: "Leave" },
    { href: "/portal/reimbursements", label: "Reimbursements" },
    ...(reports ? [{ href: "/portal/reports", label: "Reports" }] : []),
  ];

  return (
    <div className="space-y-6">
      <nav aria-label="My portal" className="-mx-1 flex gap-6 overflow-x-auto overflow-y-hidden border-b border-line px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => {
          const active = pathname === t.href || pathname.startsWith(t.href + "/");
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cn("-mb-px shrink-0 border-b-2 pb-3 text-sm font-semibold transition-colors", active ? "border-brand text-brand" : "border-transparent text-ink-muted hover:text-ink")}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
