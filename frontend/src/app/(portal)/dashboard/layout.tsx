"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { normRole } from "@/lib/roles";
import { useScopes } from "@/lib/scopes";
import { TabNav } from "@/components/ui/tab-nav";

/** My dashboard for everyone; Partner/Team view for anyone who leads people; HR view for HR, Admin and Owner. */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const scopes = useScopes();
  const r = normRole(user?.role);
  const partnerish = ["partner", "owner", "admin"].includes(r);
  const team = partnerish || !!scopes.data?.team;
  const hr = ["admin", "owner", "hr"].includes(r);
  if (!team && !hr) return <>{children}</>;
  return (
    <div className="space-y-6">
      <TabNav
        label="Dashboards"
        tabs={[
          { href: "/dashboard", label: "My dashboard", active: pathname === "/dashboard" },
          ...(team ? [{ href: "/dashboard/partner", label: partnerish ? "Partner dashboard" : "Team dashboard" }] : []),
          ...(hr ? [{ href: "/dashboard/hr", label: "HR dashboard" }] : []),
        ]}
      />
      {children}
    </div>
  );
}
