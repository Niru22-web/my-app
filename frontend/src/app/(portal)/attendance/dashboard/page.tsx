"use client";

import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { AttendanceCard } from "@/components/dashboard/attendance-card";
import { TodaySessions } from "@/components/attendance/today-sessions";
import { WeekCompare } from "@/components/attendance/week-compare";
import { AttendanceMonth } from "@/components/attendance/month-view";

export default function MyAttendancePage() {
  const { user } = useAuth();
  return (
    <div className="space-y-6">
      <PageHeader title="My attendance" description="Check in and out, and review your attendance history." />
      <AttendanceCard />
      <div className="grid gap-6 xl:grid-cols-2">
        <WeekCompare />
        <TodaySessions />
      </div>
      <AttendanceMonth employeeCode={user?.employeeId} title="My month" />
    </div>
  );
}
