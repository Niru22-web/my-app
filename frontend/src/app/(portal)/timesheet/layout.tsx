"use client";

import { usePathname } from "next/navigation";
import { TabNav } from "@/components/ui/tab-nav";
import { useScopes } from "@/lib/scopes";
import { TimerIndicator } from "@/components/timesheet/timer";

export default function TimesheetLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const scopes = useScopes();
  return (
    <div className="space-y-6">
      <div className="flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <TabNav
            label="Timesheet views"
            tabs={[
              { href: "/timesheet", label: "Time logs", active: pathname === "/timesheet" },
              { href: "/timesheet/periods", label: "Timesheets", active: pathname === "/timesheet/periods" },
              { href: "/timesheet/jobs", label: "My jobs", active: pathname === "/timesheet/jobs" },
              { href: "/timesheet/projects", label: "My projects", active: pathname === "/timesheet/projects" },
              ...(scopes.data?.team ? [{ href: "/timesheet/team", label: "Team timesheets", active: pathname === "/timesheet/team" }] : []),
              ...(scopes.data?.org ? [{ href: "/timesheet/org", label: "Organization timesheets", active: pathname === "/timesheet/org" }] : []),
              ...(scopes.data?.team || scopes.data?.org
                ? [{ href: "/timesheet/tracker", label: "Monthly Tracker (Pivot)", active: pathname === "/timesheet/tracker" }]
                : []),
            ]}
          />
        </div>
        {/* The running timer stays visible on the other tabs; Time logs shows it in its own header. */}
        {pathname !== "/timesheet" && (
          <div className="shrink-0 pb-2">
            <TimerIndicator href="/timesheet" />
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
