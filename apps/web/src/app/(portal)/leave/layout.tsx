"use client";

import { usePathname } from "next/navigation";
import { TabNav } from "@/components/ui/tab-nav";
import { useScopes } from "@/lib/scopes";
import { useAuth } from "@/lib/auth";
import { roleInfo } from "@/lib/roles";

export default function LeaveLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const scopes = useScopes();
  const r = roleInfo(useAuth().user?.role);
  const policy = r.isAdmin || r.isOwner || r.isHR;
  return (
    <div className="space-y-6">
      <TabNav
        label="Leave views"
        tabs={[
          { href: "/leave", label: "My leave", active: pathname === "/leave" },
          ...(scopes.data?.team ? [{ href: "/leave/team", label: "Team leave" }] : []),
          ...(scopes.data?.org ? [{ href: "/leave/org", label: "Organization leave" }] : []),
          ...(policy ? [{ href: "/leave/policy", label: "Leave policy" }] : []),
        ]}
      />
      {children}
    </div>
  );
}
