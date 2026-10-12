"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { useAttendanceAccess } from "@/components/attendance/api";

export default function AttendanceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { teamLogs } = useAttendanceAccess();
  const tabs = [
    { href: "/attendance/dashboard", label: "My attendance" },
    ...(teamLogs ? [{ href: "/attendance/logs", label: "Team logs" }] : []),
  ];

  return (
    <div className="space-y-6">
      {tabs.length > 1 && (
        <nav aria-label="Attendance sections" className="flex gap-6 border-b border-line">
          {tabs.map((t) => {
            const active = pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn("-mb-px border-b-2 pb-3 text-sm font-semibold transition-colors", active ? "border-brand text-brand" : "border-transparent text-ink-muted hover:text-ink")}
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
