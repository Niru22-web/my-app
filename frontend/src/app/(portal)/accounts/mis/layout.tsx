"use client";

import { usePathname } from "next/navigation";
import { TabNav } from "@/components/ui/tab-nav";

/** ASA MIS inside Accounts & Finance: P&L by entity, cost allocation, vertical-head MIS, Tally import, data checks. */
export default function MisLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="space-y-6">
      <TabNav
        label="MIS sections"
        tabs={[
          { href: "/accounts/mis", label: "P&L by entity", active: pathname === "/accounts/mis" },
          { href: "/accounts/mis/cost", label: "Cost allocation" },
          { href: "/accounts/mis/vertical", label: "Vertical MIS" },
          { href: "/accounts/mis/tally", label: "Tally import" },
          { href: "/accounts/mis/checks", label: "Data checks" },
        ]}
      />
      {children}
    </div>
  );
}
