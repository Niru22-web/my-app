"use client";

import { TabNav } from "@/components/ui/tab-nav";
import { useAttendanceAccess } from "@/components/attendance/api";

export default function AttendanceLayout({ children }: { children: React.ReactNode }) {
  const { teamLogs } = useAttendanceAccess();
  return (
    <div className="space-y-6">
      <TabNav
        label="Attendance sections"
        tabs={[{ href: "/attendance/dashboard", label: "My attendance" }, ...(teamLogs ? [{ href: "/attendance/logs", label: "Team logs" }] : [])]}
      />
      {children}
    </div>
  );
}
