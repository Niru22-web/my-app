"use client";

import { useAuth } from "@/lib/auth";
import { TabNav } from "@/components/ui/tab-nav";
import { isEmployeeRole } from "@/components/management/api";
import { normRole } from "@/lib/roles";

export default function ManagementLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const employee = isEmployeeRole(user?.role);
  const r = normRole(user?.role);
  const hr = ["admin", "owner", "hr"].includes(r);
  const tabs = [
    { href: "/management/employees", label: employee ? "My team" : "Employees" },
    ...(employee ? [] : [{ href: "/management/clients", label: "Clients" }]),
    { href: "/management/projects", label: "Projects" },
    { href: "/management/jobs", label: "Jobs" },
    ...(employee ? [] : [{ href: "/management/exits", label: "Exits" }]),
    ...(hr ? [{ href: "/management/documents", label: "Documents" }] : []),
  ];
  return (
    <div className="space-y-6">
      <TabNav label="Management sections" tabs={tabs} />
      {children}
    </div>
  );
}
