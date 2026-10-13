"use client";

import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { TabNav } from "@/components/ui/tab-nav";
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
      <TabNav label="Administration sections" tabs={tabs} />
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
