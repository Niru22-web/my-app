"use client";

import { usePathname } from "next/navigation";
import { TabNav } from "@/components/ui/tab-nav";
import { useScopes } from "@/lib/scopes";

export default function TimesheetLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const scopes = useScopes();
  return (
    <div className="space-y-6">
      <TabNav
        label="Timesheet views"
        tabs={[
          { href: "/timesheet", label: "My timesheet", active: pathname === "/timesheet" },
          ...(scopes.data?.team ? [{ href: "/timesheet/team", label: "Team timesheets" }] : []),
          ...(scopes.data?.org ? [{ href: "/timesheet/org", label: "Organization timesheets" }] : []),
        ]}
      />
      {children}
    </div>
  );
}
