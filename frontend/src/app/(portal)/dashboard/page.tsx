"use client";

import { Briefcase, CalendarClock, Clock3, FolderKanban } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";
import { roleInfo, roleLabel } from "@/lib/roles";
import { formatHours, formatNumber, greeting } from "@/lib/format";
import { StatCard } from "@/components/ui/stat";
import { AttendanceCard } from "@/components/dashboard/attendance-card";
import { WeeklyHours } from "@/components/dashboard/weekly-hours";
import { ApprovalsPanel } from "@/components/dashboard/approvals";
import { ComplianceCard, PersonalComplianceBanner } from "@/components/dashboard/compliance-card";
import { ActivityCard, BirthdaysCard, EventsCard } from "@/components/dashboard/side-cards";
import { ExpensesCard, LeaveCard } from "@/components/dashboard/leave-expenses";
import { AccountsCard } from "@/components/dashboard/accounts-card";
import { TeamChat } from "@/components/dashboard/team-chat";
import { useAttendanceToday, useCombinedDashboard, useCompliance } from "@/components/dashboard/queries";
import { canUseAccounts } from "@/components/accounts/api";

export default function DashboardPage() {
  const { user } = useAuth();
  const { can } = usePermissions();
  const r = roleInfo(user?.role);

  const combined = useCombinedDashboard();
  const attendance = useAttendanceToday();
  const compliance = useCompliance(true);
  // Only roles the Accounts API actually serves (HR and Owner would get 403).
  const showAccounts = can("accounts") && canUseAccounts(user?.role);

  const d = combined.data;
  const teamCompliance = r.isFirmWide || r.isManager || r.isPartner;
  const firstName = user?.name?.split(" ")[0] ?? "";
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <section className="flex flex-col justify-between gap-1 sm:flex-row sm:items-end">
        <div>
          <p className="text-[13px] font-medium text-ink-subtle">{today}</p>
          <h2 className="mt-1 font-display text-2xl font-bold text-ink sm:text-[28px]">
            {greeting()}, {firstName}
          </h2>
        </div>
        <p className="text-[13px] text-ink-muted">
          Signed in as <span className="font-semibold text-ink">{roleLabel(user?.role)}</span>
          {user?.department ? ` · ${user.department}` : ""}
        </p>
      </section>

      <AttendanceCard />

      {!teamCompliance && <PersonalComplianceBanner data={compliance.data} userId={user?.id} />}

      {/* Key figures — every value comes from the API */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Key figures">
        <StatCard
          label="Attendance this week"
          icon={Clock3}
          tone="brand"
          loading={attendance.isLoading}
          value={attendance.data ? formatHours(Number(attendance.data.weeklyStats.totalHours)) : "—"}
          hint={attendance.data ? `${attendance.data.weeklyStats.presentDays} day${attendance.data.weeklyStats.presentDays === 1 ? "" : "s"} present` : undefined}
        />
        <StatCard
          label="Avg. check-in"
          icon={CalendarClock}
          loading={attendance.isLoading}
          value={attendance.data?.weeklyStats.avgInTime && attendance.data.weeklyStats.avgInTime !== "--:--" ? attendance.data.weeklyStats.avgInTime : "—"}
          hint="this week"
        />
        <StatCard
          label="My projects"
          icon={FolderKanban}
          loading={combined.isLoading}
          value={formatNumber(d?.stats.totalProjects)}
          hint={d ? `${formatNumber(d.stats.totalTasks)} task${d.stats.totalTasks === 1 ? "" : "s"}` : undefined}
        />
        <StatCard
          label="Hours logged"
          icon={Briefcase}
          loading={combined.isLoading}
          value={d ? formatHours(d.stats.hoursLogged) : "—"}
          hint="on timesheets, all time"
        />
      </section>

      <ApprovalsPanel data={d} loading={combined.isLoading} r={r} />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <WeeklyHours data={d} loading={combined.isLoading} firmWide={r.isAdmin || r.isOwner} />

          {(teamCompliance || showAccounts) && (
            <div className="grid gap-6 lg:grid-cols-2">
              {teamCompliance && (
                <ComplianceCard
                  data={compliance.data}
                  loading={compliance.isLoading}
                  error={compliance.isError}
                  onRetry={() => compliance.refetch()}
                  scope={r.isFirmWide ? "firm" : "team"}
                />
              )}
              {showAccounts && (
                <AccountsCard />
              )}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <LeaveCard data={d} loading={combined.isLoading} />
            <ExpensesCard data={d} loading={combined.isLoading} />
          </div>
        </div>

        <aside className="space-y-6">
          <EventsCard data={d} loading={combined.isLoading} />
          <BirthdaysCard data={d} loading={combined.isLoading} />
          {r.isFirmWide ? <ActivityCard data={d} loading={combined.isLoading} firmWide={r.isAdmin || r.isOwner} /> : <TeamChat />}
        </aside>
      </div>
    </div>
  );
}
