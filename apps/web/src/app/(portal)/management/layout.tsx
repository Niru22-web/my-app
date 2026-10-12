"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { isEmployeeRole } from "@/components/management/api";

export default function ManagementLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const employee = isEmployeeRole(user?.role);
  const tabs = [
    { href: "/management/employees", label: employee ? "My team" : "Employees" },
    ...(employee ? [] : [{ href: "/management/clients", label: "Clients" }]),
    { href: "/management/projects", label: "Projects" },
    { href: "/management/jobs", label: "Jobs" },
  ];
  return (
    <div className="space-y-6">
      <nav aria-label="Management sections" className="-mx-1 flex gap-6 overflow-x-auto overflow-y-hidden border-b border-line px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
