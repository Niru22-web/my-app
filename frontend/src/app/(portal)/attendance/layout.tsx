"use client";

import { TabNav } from "@/components/ui/tab-nav";
import { useAttendanceAccess } from "@/components/attendance/api";
import { useScopes } from "@/lib/scopes";

export default function AttendanceLayout({ children }: { children: React.ReactNode }) {
  const scopes = useScopes();
  const access = useAttendanceAccess();
  // IT sees the firm view only when an Admin has granted the Attendance permission.
  const org = !!scopes.data?.org && (!access.isIT || access.firmWide);
  return (
    <div className="space-y-6">
      <TabNav
        label="Attendance views"
        tabs={[
          { href: "/attendance/dashboard", label: "My attendance" },
          { href: "/attendance/requests", label: "Corrections" },
          ...(scopes.data?.team ? [{ href: "/attendance/team", label: "Team attendance" }] : []),
          ...(org ? [{ href: "/attendance/org", label: "Organization attendance" }] : []),
        ]}
      />
      {children}
    </div>
  );
}
