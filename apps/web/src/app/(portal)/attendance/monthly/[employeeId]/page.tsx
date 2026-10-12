"use client";

import { Suspense, use, useEffect } from "react";
import { today } from "@/lib/dates";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { assetUrl } from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { AttendanceMonth } from "@/components/attendance/month-view";
import { useAttendanceAccess, useMonthly, useScopedPeople } from "@/components/attendance/api";

export default function EmployeeMonthPage({ params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = use(params);
  return (
    <Suspense fallback={<Skeleton className="h-[600px]" />}>
      <EmployeeMonth code={decodeURIComponent(employeeId)} />
    </Suspense>
  );
}

function EmployeeMonth({ code }: { code: string }) {
  const month = useSearchParams().get("month");
  const initial = month && /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : undefined;
  const { user } = useAuth();
  const router = useRouter();

  const self = user?.employeeId === code;
  const access = useAttendanceAccess();
  const firmWide = access.firmWide;
  const reviewer = access.teamLogs;
  const people = useScopedPeople(!self && !firmWide && reviewer);
  const header = useMonthly(code, (initial ?? today()).slice(0, 7));

  // Allowed: yourself, firm-wide roles, or managers/partners for their own reports.
  const allowed = self || firmWide || (reviewer && !!people.data?.some((p) => p.employeeId === code));
  const deciding = access.loading || (!self && !firmWide && reviewer && people.isLoading);

  useEffect(() => {
    if (!deciding && !allowed) router.replace("/attendance/dashboard");
  }, [deciding, allowed, router]);

  if (deciding || !allowed) return <Skeleton className="h-[600px]" />;

  const e = header.data?.employee;
  return (
    <div className="space-y-6">
      <Link href={reviewer ? "/attendance/logs" : "/attendance/dashboard"} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-brand">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <PageHeader title="Monthly attendance" />
      <Card className="flex items-center gap-4 p-5">
        <Avatar name={e?.name ?? code} src={assetUrl(e?.photo)} size={48} />
        <div className="min-w-0">
          <p className="font-display text-lg font-bold text-ink">{e?.name ?? code}</p>
          <p className="text-sm text-ink-muted">{[code, e?.designation, e?.department].filter(Boolean).join(" · ")}</p>
        </div>
      </Card>
      <AttendanceMonth employeeCode={code} title="Attendance calendar" initialMonth={initial} />
    </div>
  );
}
