"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Briefcase, Mail, Pencil, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError, assetUrl } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { roleInfo, roleLabel } from "@/lib/roles";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormRow, Input, Select } from "@/components/ui/inputs";
import { PeoplePicker } from "@/components/ui/people-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { fullName, useMaster, usePeople } from "@/components/management/api";
import { real, realDate, useMyDetails, useProfileMutations, type EmployeeDetails } from "@/components/profile/api";

export default function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const r = roleInfo(user?.role);
  const canEdit = r.isAdmin || r.isHR || r.isOwner;
  const q = useMyDetails(id);
  const d = q.data;
  const p = d?.profile;
  const auto = !!p && !realDate(p.dob);
  const [editOpen, setEditOpen] = useState(false);

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
                <div className="flex flex-wrap items-center gap-2">
                  {d?.status && <Badge tone={statusTone(d.status)}>{d.status.replace(/_/g, " ")}</Badge>}
                  {d?.officeEmail && (
                    <a href={`mailto:${d.officeEmail}`} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-[13px] font-medium text-ink hover:bg-surface-muted">
                      <Mail className="h-4 w-4" /> Email
                    </a>
                  )}
                  {canEdit && d && (
                    <Button size="sm" onClick={() => setEditOpen(true)}>
                      <Pencil className="h-4 w-4" /> Edit record
                    </Button>
                  )}
                </div>
              </>
            )}
          </Card>

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

      {editOpen && d && <EditEmployeeDialog details={d} onClose={() => setEditOpen(false)} />}
    </div>
  );
}

function EditEmployeeDialog({ details: d, onClose }: { details: EmployeeDetails; onClose: () => void }) {
  const toast = useToast();
  const { update } = useProfileMutations();
  const people = usePeople();
  const roles = useMaster("roles");
  const designations = useMaster("designations");
  const departments = useMaster("departments");

  const [firstName, setFirstName] = useState(d.firstName);
  const [lastName, setLastName] = useState(d.lastName);
  const [designation, setDesignation] = useState(real(d.designation) ?? "");
  const [department, setDepartment] = useState(real(d.department) ?? "");
  const [role, setRole] = useState(d.role ?? "Employee");
  const [status, setStatus] = useState(d.status ?? "active");
  const [managers, setManagers] = useState<string[]>(d.managers.map((m) => m.id));
  const [partners, setPartners] = useState<string[]>(d.partners.map((p) => p.id));
  const [subManagers, setSubManagers] = useState<string[]>(d.subManagers.map((s) => s.id));
  const [error, setError] = useState<string | null>(null);

  const pickOptions = (people.data ?? [])
    .filter((p) => p.id !== d.id)
    .map((p) => ({ id: p.id, label: fullName(p), sub: [p.employeeId, p.designation].filter(Boolean).join(" · ") }));

  function save() {
    setError(null);
    if (!firstName.trim() || !lastName.trim()) return setError("First and last name are required.");
    update.mutate(
      {
        id: d.id,
        body: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          designation: designation.trim(),
          department: department.trim(),
          role,
          status,
          reportingManagerIds: managers,
          reportingPartnerIds: partners,
          subManagerIds: subManagers,
        },
      },
      {
        onSuccess: () => (toast.success("Employee record updated"), onClose()),
        onError: (e) => setError(e instanceof ApiError ? e.message : "Couldn’t update employee record."),
      },
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={`Edit ${d.firstName} ${d.lastName}`}
      description="Update work details, portal role and reporting lines."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button onClick={save} loading={update.isPending}>
            Save changes
          </Button>
        </>
      }
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), save())}>
        <FormRow label="First name" htmlFor="ed-fn" required>
          <Input id="ed-fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </FormRow>
        <FormRow label="Last name" htmlFor="ed-ln" required>
          <Input id="ed-ln" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </FormRow>
        <FormRow label="Designation" htmlFor="ed-desig">
          <Select id="ed-desig" value={designation} onChange={(e) => setDesignation(e.target.value)}>
            <option value="">Select designation</option>
            {[...new Set([designation, ...(designations.data ?? []).map((x) => x.name)].filter(Boolean))].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Department" htmlFor="ed-dept">
          <Select id="ed-dept" value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">Select department</option>
            {[...new Set([department, ...(departments.data ?? []).map((x) => x.name)].filter(Boolean))].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Portal role" htmlFor="ed-role">
          <Select id="ed-role" value={role} onChange={(e) => setRole(e.target.value)}>
            {[...new Set([role, "Employee", "Manager", "Partner", "HR", "IT", "Accountant", "Admin", ...(roles.data ?? []).map((x) => x.name)].filter(Boolean))].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Status" htmlFor="ed-status">
          <Select id="ed-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </FormRow>
        <FormRow label="Reporting managers" htmlFor="ed-mgrs" className="sm:col-span-2">
          <PeoplePicker id="ed-mgrs" options={pickOptions} value={managers} onChange={setManagers} loading={people.isLoading} placeholder="Assign managers" />
        </FormRow>
        <FormRow label="Reporting partners" htmlFor="ed-ptrs" className="sm:col-span-2">
          <PeoplePicker id="ed-ptrs" options={pickOptions} value={partners} onChange={setPartners} loading={people.isLoading} placeholder="Assign partners" />
        </FormRow>
        <FormRow label="Sub-managers" htmlFor="ed-subs" className="sm:col-span-2">
          <PeoplePicker id="ed-subs" options={pickOptions} value={subManagers} onChange={setSubManagers} loading={people.isLoading} placeholder="Assign sub-managers" />
        </FormRow>
        {error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger sm:col-span-2">{error}</p>}
        <button type="submit" className="sr-only">
          Save changes
        </button>
      </form>
    </Dialog>
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
