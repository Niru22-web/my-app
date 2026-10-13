"use client";

import { TabNav } from "@/components/ui/tab-nav";

export default function PortalSectionLayout({ children }: { children: React.ReactNode }) {
  const tabs = [
    { href: "/portal/profile", label: "Profile" },
    { href: "/portal/reimbursements", label: "Reimbursements" },
  ];

  return (
    <div className="space-y-6">
      <TabNav label="My portal" tabs={tabs} />
      {children}
    </div>
  );
}
