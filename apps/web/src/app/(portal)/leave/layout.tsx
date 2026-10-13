"use client";

import { usePathname } from "next/navigation";
import { TabNav } from "@/components/ui/tab-nav";
import { useScopes } from "@/lib/scopes";

export default function LeaveLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const scopes = useScopes();
  return (
    <div className="space-y-6">
      <TabNav
        label="Leave views"
        tabs={[
          { href: "/leave", label: "My leave", active: pathname === "/leave" },
          ...(scopes.data?.team ? [{ href: "/leave/team", label: "Team leave" }] : []),
          ...(scopes.data?.org ? [{ href: "/leave/org", label: "Organization leave" }] : []),
        ]}
      />
      {children}
    </div>
  );
}
