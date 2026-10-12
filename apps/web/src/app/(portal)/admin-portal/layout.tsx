"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminTabs } from "@/components/admin/tabs";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { inArea, tabs, loading } = useAdminTabs();

  if (loading) return <Skeleton className="h-96" />;
  if (!inArea)
    return (
      <Card>
        <EmptyState icon={Lock} title="You don’t have access to administration" description="Ask an administrator if you need it." />
      </Card>
    );
  const allowed = tabs.some((t) => pathname === t.href || pathname.startsWith(t.href + "/"));

  return (
    <div className="space-y-6">
      <nav aria-label="Administration sections" className="-mx-1 flex gap-6 overflow-x-auto overflow-y-hidden border-b border-line px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
      {allowed ? (
        children
      ) : (
        <Card>
          <EmptyState icon={Lock} title="This section isn’t available to your role" />
        </Card>
      )}
    </div>
  );
}
