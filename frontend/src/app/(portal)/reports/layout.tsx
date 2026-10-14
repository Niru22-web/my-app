"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { roleInfo } from "@/lib/roles";
import { TabNav } from "@/components/ui/tab-nav";
import { TIER_META, useReportCatalog, type Tier } from "@/components/reports/api";

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const r = roleInfo(user?.role);
  const cat = useReportCatalog();
  const tiers = (["my", "team", "org"] as Tier[]).filter((t) => cat.data?.access[t]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 print:hidden">
        <div className="min-w-0 flex-1">
          <TabNav label="Report groups" tabs={tiers.map((t) => ({ href: TIER_META[t].href, label: TIER_META[t].label }))} />
        </div>
        {(r.isAdmin || r.isOwner) && (
          <Link
            href="/admin-portal/users"
            className="mb-3 inline-flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-brand hover:underline"
            title="Who can see Team and Organization reports (Reports and Analytics permissions)"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden /> Access permissions
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}
