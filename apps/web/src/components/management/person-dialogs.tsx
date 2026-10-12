"use client";

import { useState, type FormEvent } from "react";
import { Check, MailCheck, X } from "lucide-react";
import { ApiError, assetUrl } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { FormRow, Input, Select, Textarea } from "@/components/ui/inputs";
import { PeoplePicker } from "@/components/ui/people-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { fullName, useMaster, useMgmtMutations, usePendingPeople, usePeople, type Person } from "./api";

/** Invite a new employee. They receive an email link to complete registration, then appear in Pending approvals. */
export function AddPersonDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <AddPersonForm onClose={onClose} />;
}

function AddPersonForm({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const { createPerson } = useMgmtMutations();
  const roles = useMaster("roles");
  const designations = useMaster("designations");
  const departments = useMaster("departments");
  const shifts = useMaster("shifts");
  const locations = useMaster("locations");
  const types = useMaster("employment-types");
  const people = usePeople();

  const [f, setF] = useState({ firstName: "", lastName: "", officeEmail: "", roleId: "", designationId: "", departmentId: "", shiftId: "", locationId: "", employmentTypeId: "" });
  const [partners, setPartners] = useState<string[]>([]);
  const [managers, setManagers] = useState<string[]>([]);
  const [subs, setSubs] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  const roleName = roles.data?.find((r) => r.id === f.roleId)?.name ?? "";
  const isPartner = /partner/i.test(roleName);
  const isEmployee = /^(employee|user)$/i.test(roleName);
  const opts = (filter: (p: Person) => boolean) =>
    (people.data ?? []).filter((p) => (p.status ?? "").toLowerCase() === "active" && filter(p)).map((p) => ({ id: p.id, label: fullName(p), sub: [p.employeeId, p.designation].filter(Boolean).join(" · ") }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const errs: Record<string, string> = {};
    if (!f.firstName.trim()) errs.firstName = "Required.";
    if (!f.lastName.trim()) errs.lastName = "Required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.officeEmail.trim())) errs.officeEmail = "Enter a valid office email.";
    if (!f.roleId) errs.roleId = "Choose a portal role.";
    if (!f.designationId) errs.designationId = "Choose a designation.";
    if (!f.departmentId) errs.departmentId = "Choose a department.";
    if (!isPartner && partners.length === 0) errs.partners = "Choose at least one reporting partner.";
    if (isEmployee && managers.length === 0) errs.managers = "Employees need at least one reporting manager.";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const name = (list: typeof roles.data, id: string) => list?.find((x) => x.id === id)?.name ?? "";
    const body = {
      firstName: f.firstName.trim(),
      lastName: f.lastName.trim(),
      officeEmail: f.officeEmail.trim().toLowerCase(),
      role: roleName,
      roleId: f.roleId,
      designation: name(designations.data, f.designationId),
      designationId: f.designationId,
      department: name(departments.data, f.departmentId),
      departmentId: f.departmentId,
      shiftId: f.shiftId || undefined,
      locationId: f.locationId || undefined,
      employmentTypeId: f.employmentTypeId || undefined,
      reportingPartnerIds: isPartner ? [] : partners,
      reportingManagerIds: isPartner ? [] : managers,
      subManagerIds: isEmployee ? subs : [],
      status: "pending",
      isOldEmployee: false,
    };
    try {
      const res = (await createPerson.mutateAsync(body)) as { emailStatus?: string; data?: { employeeId?: string } };
      const code = res?.data?.employeeId ? ` (${res.data.employeeId})` : "";
      if (res?.emailStatus === "sent") toast.success("Invitation sent", `${body.firstName} ${body.lastName}${code} will get a link to complete registration.`);
      else toast.info("Employee added — invitation email not sent", `${body.firstName}${code} was created, but the email service is unavailable. Use “Resend invitation” once it’s configured.`);
      onClose();
    } catch (err) {
      setServerError(err instanceof ApiError ? (/unique|P2002|already/i.test(err.message) ? "An employee with this email already exists." : err.message) : "Couldn’t add the employee.");
    }
  }

  const sel = (id: keyof typeof f, label: string, list: typeof roles, required?: boolean) => (
    <FormRow label={label} htmlFor={`np-${id}`} required={required} error={errors[id]}>
      <Select id={`np-${id}`} value={f[id]} invalid={!!errors[id]} onChange={(e) => set(id, e.target.value)}>
        <option value="">{list.isLoading ? "Loading…" : required ? "Select" : "Not set"}</option>
        {(list.data ?? []).map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </Select>
    </FormRow>
  );

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="Invite an employee"
      description="They’ll get an email link to complete their profile, then appear under Pending for approval. Their employee code is assigned automatically."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={createPerson.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="person-form" loading={createPerson.isPending}>
            <MailCheck className="h-4 w-4" /> Send invitation
          </Button>
        </>
      }
    >
      <form id="person-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        {[roles, designations, departments].some((l) => l.isSuccess && (l.data?.length ?? 0) === 0) && (
          <p role="alert" className="rounded-xl bg-warning-soft px-3.5 py-2.5 text-[13px] text-ink sm:col-span-2">
            Some required lists are empty (
            {[
              ["roles", roles],
              ["designations", designations],
              ["departments", departments],
            ]
              .filter(([, l]) => (l as typeof roles).isSuccess && ((l as typeof roles).data?.length ?? 0) === 0)
              .map(([n]) => n)
              .join(", ")}
            ). Add them under Administration → Masters before inviting people.
          </p>
        )}
        <FormRow label="First name" htmlFor="np-first" required error={errors.firstName}>
          <Input id="np-first" value={f.firstName} invalid={!!errors.firstName} onChange={(e) => set("firstName", e.target.value)} />
        </FormRow>
        <FormRow label="Last name" htmlFor="np-last" required error={errors.lastName}>
          <Input id="np-last" value={f.lastName} invalid={!!errors.lastName} onChange={(e) => set("lastName", e.target.value)} />
        </FormRow>
        <FormRow label="Office email" htmlFor="np-email" required error={errors.officeEmail} className="sm:col-span-2">
          <Input id="np-email" type="email" value={f.officeEmail} invalid={!!errors.officeEmail} onChange={(e) => set("officeEmail", e.target.value)} />
        </FormRow>
        {sel("roleId", "Portal role", roles, true)}
        {sel("designationId", "Designation", designations, true)}
        {sel("departmentId", "Department", departments, true)}
        {sel("employmentTypeId", "Employment type", types)}
        {sel("shiftId", "Shift", shifts)}
        {sel("locationId", "Location", locations)}
        {!isPartner && (
          <>
            <FormRow label="Reporting partner(s)" htmlFor="np-partners" required error={errors.partners} className="sm:col-span-2">
              <PeoplePicker id="np-partners" loading={people.isLoading} value={partners} onChange={setPartners} invalid={!!errors.partners} options={opts((p) => /partner/i.test(p.role ?? ""))} />
            </FormRow>
            <FormRow label="Reporting manager(s)" htmlFor="np-managers" required={isEmployee} error={errors.managers} className="sm:col-span-2">
              <PeoplePicker id="np-managers" loading={people.isLoading} value={managers} onChange={setManagers} invalid={!!errors.managers} options={opts((p) => /manager|admin|partner/i.test(p.role ?? ""))} />
            </FormRow>
          </>
        )}
        {isEmployee && (
          <FormRow label="Sub-manager(s)" htmlFor="np-subs" className="sm:col-span-2" hint="Optional">
            <PeoplePicker id="np-subs" loading={people.isLoading} value={subs} onChange={setSubs} options={opts(() => true)} />
          </FormRow>
        )}
        {serverError && <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger sm:col-span-2">{serverError}</p>}
      </form>
    </Dialog>
  );
}

/** People who completed registration and are waiting for approval. */
export function PendingDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const q = usePendingPeople(open);
  const m = useMgmtMutations();
  const [rejecting, setRejecting] = useState<Person | null>(null);
  const [reason, setReason] = useState("");

  return (
    <Dialog open={open} onClose={onClose} size="lg" title="Pending approvals" description="Approving gives the person access to the portal.">
      {q.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : (q.data?.length ?? 0) === 0 ? (
        <EmptyState icon={MailCheck} title="No one is waiting for approval" />
      ) : rejecting ? (
        <div className="space-y-3">
          <p className="text-sm text-ink">
            Reject <span className="font-semibold">{fullName(rejecting)}</span>’s registration?
          </p>
          <FormRow label="Reason" htmlFor="rej-reason" required hint="Shared in the notification. The current system doesn’t store it on the record.">
            <Textarea id="rej-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </FormRow>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRejecting(null)}>
              Back
            </Button>
            <Button
              variant="danger"
              loading={m.rejectPerson.isPending}
              disabled={reason.trim().length < 3}
              onClick={() =>
                m.rejectPerson.mutate(
                  { id: rejecting.id, reason: reason.trim() },
                  {
                    onSuccess: () => (toast.success("Registration rejected", fullName(rejecting)), setRejecting(null), setReason(""), void q.refetch()),
                    onError: (e) => toast.error("Couldn’t reject", e instanceof ApiError ? e.message : undefined),
                  },
                )
              }
            >
              Reject
            </Button>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {q.data!.map((p) => (
            <li key={p.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={fullName(p)} src={assetUrl(p.profileImage)} size={36} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{fullName(p)}</p>
                  <p className="truncate text-xs text-ink-subtle">
                    {p.officeEmail} · {[p.designation, p.department].filter(Boolean).join(", ")}
                    {p.createdAt ? ` · added ${formatDate(p.createdAt)}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" className="text-danger" onClick={() => setRejecting(p)}>
                  <X className="h-4 w-4" /> Reject
                </Button>
                <Button
                  size="sm"
                  loading={m.approvePerson.isPending && m.approvePerson.variables === p.id}
                  onClick={() =>
                    m.approvePerson.mutate(p.id, {
                      onSuccess: () => (toast.success("Approved", `${fullName(p)} can now sign in.`), void q.refetch()),
                      onError: (e) => toast.error("Couldn’t approve", e instanceof ApiError ? e.message : undefined),
                    })
                  }
                >
                  <Check className="h-4 w-4" /> Approve
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
