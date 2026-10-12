"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";
import { roleInfo } from "@/lib/roles";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { canApproveRequests, canManageOps, isRequester } from "@/components/assets/api";
import { MyAssets } from "@/components/assets/my-assets";

const BASE = "/admin/asset-management";

export default function AssetLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { can, loading } = usePermissions();
  const r = roleInfo(user?.role);

  // Same split as the legacy portal: requesters get their own page at every asset URL.
  if (isRequester(user?.role)) return <MyAssets />;
  if (loading) return <Skeleton className="h-96" />;
  if (!(r.isAdmin || r.isHR || r.isIT || can("asset_management")))
    return (
      <Card>
        <EmptyState icon={Lock} title="You don’t have access to asset management" description="Ask an administrator if you need it." />
      </Card>
    );

  const tabs = [
    { href: `${BASE}/dashboard`, label: "Overview" },
    { href: `${BASE}/assets`, label: "Inventory" },
    { href: `${BASE}/assignment`, label: "Assignments" },
    ...(canApproveRequests(user?.role) ? [{ href: `${BASE}/requests`, label: "Requests" }] : []),
    { href: `${BASE}/maintenance`, label: "Maintenance" },
    { href: `${BASE}/vendors`, label: "Vendors" },
    ...(canManageOps(user?.role) ? [{ href: `${BASE}/masters`, label: "Setup" }] : []),
  ];

  return (
    <div className="space-y-6">
      <nav aria-label="Asset sections" className="-mx-1 flex gap-6 overflow-x-auto overflow-y-hidden border-b border-line px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
