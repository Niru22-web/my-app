"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { TabNav } from "@/components/ui/tab-nav";
import { canReview } from "@/components/timesheet/api";

export default function TimesheetLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  return (
    <div className="space-y-6">
      <TabNav
        label="Timesheet sections"
        tabs={[
          { href: "/timesheet", label: "My timesheet", active: pathname === "/timesheet" },
          ...(canReview(user?.role) ? [{ href: "/timesheet/team", label: "Team approvals" }] : []),
        ]}
      />
      {children}
    </div>
  );
}
