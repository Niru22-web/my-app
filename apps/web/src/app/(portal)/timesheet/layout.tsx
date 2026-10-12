"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { canReview } from "@/components/timesheet/api";

export default function TimesheetLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const tabs = [
    { href: "/timesheet", label: "My timesheet" },
    ...(canReview(user?.role) ? [{ href: "/timesheet/team", label: "Team approvals" }] : []),
  ];

  return (
    <div className="space-y-6">
      {tabs.length > 1 && (
        <nav aria-label="Timesheet sections" className="flex gap-6 border-b border-line">
          {tabs.map((t) => {
            const active = pathname === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px border-b-2 pb-3 text-sm font-semibold transition-colors",
                  active ? "border-brand text-brand" : "border-transparent text-ink-muted hover:text-ink",
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      )}
      {children}
    </div>
  );
}
