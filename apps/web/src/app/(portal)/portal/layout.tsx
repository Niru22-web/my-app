"use client";

import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";
import { normRole } from "@/lib/roles";
import { TabNav } from "@/components/ui/tab-nav";

export default function PortalSectionLayout({ children }: { children: React.ReactNode }) {
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
      <TabNav label="My portal" tabs={tabs} />
      {children}
    </div>
  );
}
