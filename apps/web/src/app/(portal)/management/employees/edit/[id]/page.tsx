"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, Briefcase, Lock, Mail, Users } from "lucide-react";
import { assetUrl } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { roleLabel } from "@/lib/roles";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge, statusTone } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/empty-state";
import { real, realDate, useMyDetails } from "@/components/profile/api";

/** Read-only employee record. Editing returns once the backend stops wiping reporting lines on save. */
export default function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const q = useMyDetails(id);
  const d = q.data;
  const p = d?.profile;
  const auto = !!p && !realDate(p.dob);

  return (
    <div className="space-y-6">
      <Link href="/management/employees" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-brand">
        <ArrowLeft className="h-4 w-4" /> Employees
      </Link>

      {q.isError ? (
        <Card>
          <ErrorState onRetry={() => q.refetch()} />
        </Card>
      ) : (
        <>
          <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            {q.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <>
                <Avatar name={`${d?.firstName} ${d?.lastName}`} src={assetUrl(d?.profileImage)} size={64} />
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-xl font-bold text-ink">
                    {d?.firstName} {d?.lastName}
                  </h2>
                  <p className="text-sm text-ink-muted">{[d?.employeeId, real(d?.designation), real(d?.department)].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="flex items-center gap-2">
                  {d?.status && <Badge tone={statusTone(d.status)}>{d.status.replace(/_/g, " ")}</Badge>}
                  {d?.officeEmail && (
                    <a href={`mailto:${d.officeEmail}`} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-[13px] font-medium text-ink hover:bg-surface-muted">
                      <Mail className="h-4 w-4" /> Email
                    </a>
                  )}
                </div>
              </>
            )}
          </Card>

          <div className="flex gap-2.5 rounded-xl border border-line bg-surface px-4 py-3 text-[13px] text-ink-muted">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
            <p>Editing employee records is paused until the server update — the current server removes a person’s reporting line whenever their record is saved. Personal and bank details are visible to the employee and HR only.</p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader icon={Briefcase} title="Work" />
              <dl className="grid gap-4 p-5 sm:grid-cols-2">
                <Item label="Office email" value={d?.officeEmail} />
                <Item label="Portal role" value={d?.role ? roleLabel(d.role) : null} />
                <Item label="Designation" value={real(d?.designation)} />
                <Item label="Department" value={real(d?.department)} />
                <Item label="Date of joining" value={p?.doj && !auto ? formatDate(p.doj) : null} />
                <Item label="Employment type" value={real(p?.employmentType)} />
                <Item label="Portal account since" value={d?.createdAt ? formatDate(d.createdAt) : null} />
              </dl>
            </Card>
            <Card>
              <CardHeader icon={Users} title="Reporting line" />
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                {(["managers", "partners", "subManagers"] as const).map((k) => (
                  <div key={k}>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{k === "subManagers" ? "Sub-managers" : k}</p>
                    {!d?.[k]?.length ? (
                      <p className="text-sm italic text-ink-subtle">None</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {d[k].map((x) => (
                          <li key={x.id} className="flex items-center gap-2">
                            <Avatar name={x.name} size={26} />
                            <span className="text-sm text-ink">{x.name}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Item({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-ink-subtle">{label}</dt>
      <dd className={value ? "mt-0.5 text-sm text-ink" : "mt-0.5 text-sm italic text-ink-subtle"}>{value || "Not on record"}</dd>
    </div>
  );
}
