"use client";

import { Lock } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";
import { roleInfo } from "@/lib/roles";
import { TabNav } from "@/components/ui/tab-nav";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { canApproveRequests, canManageOps, isRequester } from "@/components/assets/api";
import { MyAssets } from "@/components/assets/my-assets";

const BASE = "/admin/asset-management";

export default function AssetLayout({ children }: { children: React.ReactNode }) {
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
      <TabNav label="Asset sections" tabs={tabs} />
      {children}
    </div>
  );
}
