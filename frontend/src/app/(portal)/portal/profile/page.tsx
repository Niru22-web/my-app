"use client";

import { useRef, useState, type ReactNode } from "react";
import { AlertTriangle, BadgeCheck, Briefcase, Camera, Download, FileText, IdCard, KeyRound, Pencil, ShieldAlert, UserRound, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError, assetUrl, downloadFile } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { roleLabel } from "@/lib/roles";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Dialog } from "@/components/ui/dialog";
import { FormRow, Input, Textarea } from "@/components/ui/inputs";
import { useToast } from "@/components/ui/toast";
import { mask, real, realDate, useMyDetails, useMyDocuments, useProfileMutations, type EmployeeDetails } from "@/components/profile/api";

export default function ProfilePage() {
  const { user, patchUser } = useAuth();
  const toast = useToast();
  const q = useMyDetails(user?.id);
  const docs = useMyDocuments(user?.id);
  const m = useProfileMutations();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return toast.error("Use a JPG, PNG or WEBP image");
    if (file.size > 10 * 1024 * 1024) return toast.error("The photo must be under 10 MB");
    try {
      const res = await m.photo.mutateAsync(file);
      patchUser({ profileImage: res.profileImage });
      toast.success("Profile photo updated");
    } catch (e) {
      toast.error("Couldn’t update the photo", e instanceof ApiError ? e.message : undefined);
    }
  }

  if (q.isError)
    return (
      <Card>
        <ErrorState onRetry={() => q.refetch()} />
      </Card>
    );

  const d = q.data;
  const p = d?.profile;
  // The legacy photo upload auto-creates a profile filled with defaults (DOB 2000-01-01, gender "Other",
  // "Single", joining date = upload date). None of those are real — hide them.
  const autoFilled = !!p && !realDate(p.dob);
  const fromAuto = (v: string | null | undefined) => (autoFilled ? null : real(v));
  const name = d ? `${d.firstName} ${d.lastName}`.trim() : user?.name;
  const noManager = d && d.managers.length === 0 && d.partners.length === 0 && d.subManagers.length === 0;

  return (
    <div className="space-y-6">
      {/* Identity */}
      <Card className="overflow-hidden">
        <div className="h-24 bg-brand dark:bg-brand-soft" aria-hidden />
        <div className="flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end">
          <div className="relative -mt-12 w-fit">
            <Avatar name={name} src={assetUrl(d?.profileImage ?? user?.profileImage)} size={96} className="ring-4" />
            <button
              onClick={() => fileInput.current?.click()}
              disabled={m.photo.isPending}
              className="absolute bottom-0 right-0 grid h-9 w-9 place-items-center rounded-full border-2 border-surface bg-brand text-brand-ink shadow hover:bg-brand-hover disabled:opacity-60"
              aria-label="Change profile photo"
              title="Change photo"
            >
              <Camera className="h-4 w-4" />
            </button>
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => (onPhoto(e.target.files?.[0]), (e.target.value = ""))} />
          </div>
          <div className="min-w-0 flex-1">
            {q.isLoading ? (
              <Skeleton className="h-7 w-48" />
            ) : (
              <>
                <h2 className="font-display text-2xl font-bold text-ink">{name}</h2>
                <p className="text-sm text-ink-muted">{[real(d?.designation), real(d?.department)].filter(Boolean).join(" · ") || roleLabel(d?.role)}</p>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {d?.status && <Badge tone={statusTone(d.status)}>{d.status.replace(/_/g, " ")}</Badge>}
            {d && (
              <Button variant="secondary" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" /> Edit details
              </Button>
            )}
            <Button variant="secondary" onClick={() => setPwOpen(true)}>
              <KeyRound className="h-4 w-4" /> Change password
            </Button>
          </div>
        </div>
      </Card>

      {noManager && (
        <div className="flex gap-2.5 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-[13px] text-ink">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          <p>
            <span className="font-semibold">No reporting manager or partner is linked to your profile.</span> Your leave requests and expense claims may not reach an approver — please ask HR to set your reporting line.
          </p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Section icon={Briefcase} title="Work" loading={q.isLoading}>
            <Field label="Employee ID" value={d?.employeeId} />
            <Field label="Office email" value={d?.officeEmail} />
            <Field label="Role" value={d?.role ? roleLabel(d.role) : null} />
            <Field label="Designation" value={real(d?.designation)} />
            <Field label="Department" value={real(d?.department)} />
            <Field label="Date of joining" value={p?.doj && !autoFilled ? formatDate(p.doj) : null} />
            <Field label="Employment type" value={real(p?.employmentType)} />
            <Field label="Seniority" value={real(p?.seniorityLevel)} />
            <Field label="Experience" value={real(p?.experience)} />
            {(p?.skills?.filter(real).length ?? 0) > 0 && (
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-xs text-ink-subtle">Skills</dt>
                <dd className="mt-1.5 flex flex-wrap gap-1.5">
                  {p!.skills!.filter((s) => real(s)).map((s) => (
                    <Badge key={s} tone="brand">
                      {s}
                    </Badge>
                  ))}
                </dd>
              </div>
            )}
          </Section>

          <Section icon={UserRound} title="Personal" loading={q.isLoading}>
            <Field label="Date of birth" value={realDate(p?.dob) ? formatDate(p!.dob) : null} />
            <Field label="Gender" value={fromAuto(p?.gender)} />
            <Field label="Marital status" value={fromAuto(p?.maritalStatus)} />
            <Field label="Personal email" value={real(p?.personalEmail)} />
            <Field label="Personal mobile" value={real(p?.personalMobile)} />
            <Field label="Education" value={real(p?.education)} />
            <Field label="Current address" value={[real(p?.currentAddress), real(p?.currentPinCode)].filter(Boolean).join(" – ") || null} wide />
            <Field label="Permanent address" value={real(p?.permanentAddress)} wide />
          </Section>

          <Section icon={ShieldAlert} title="Identity & bank" description="Shown partially for your security" loading={q.isLoading}>
            <Field label="PAN" value={mask(p?.pan)} />
            <Field label="Aadhaar" value={mask(p?.aadhaar)} />
            <Field label="Bank" value={real(p?.bankName)} />
            <Field label="Account number" value={mask(p?.bankAccountNumber)} />
            <Field label="IFSC" value={real(p?.ifscCode)} />
            <Field label="Emergency contact" value={[real(p?.emergencyContactName), real(p?.emergencyContactRelation) && `(${real(p?.emergencyContactRelation)})`, real(p?.emergencyContactPhone)].filter(Boolean).join(" ") || null} />
          </Section>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader icon={Users} title="Reporting line" />
            <div className="space-y-4 p-5">
              {q.isLoading ? (
                <Skeleton className="h-24" />
              ) : (
                <>
                  <People label="Managers" people={d?.managers} />
                  <People label="Partners" people={d?.partners} />
                  {(d?.subManagers.length ?? 0) > 0 && <People label="Sub-managers" people={d?.subManagers} />}
                </>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader icon={FileText} title="My documents" description="Uploaded by you or HR" />
            {docs.isLoading ? (
              <div className="space-y-2 p-5">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : (docs.data?.length ?? 0) === 0 ? (
              <EmptyState icon={FileText} title="No documents on file" />
            ) : (
              <ul className="space-y-1 p-3">
                {docs.data!.map((doc) => (
                  <li key={doc.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-muted">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                      <IdCard className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{doc.title}</span>
                      <span className="block text-xs text-ink-subtle">
                        {doc.category} · {formatDate(doc.uploadedAt)}
                      </span>
                    </span>
                    <button
                      onClick={() => downloadFile(`employees/documents/${doc.id}/download`, doc.fileName).catch((e) => toast.error("Download failed", e instanceof ApiError ? e.message : undefined))}
                      className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-surface hover:text-brand"
                      aria-label={`Download ${doc.title}`}
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {d && (
            <p className="flex items-center gap-1.5 px-1 text-xs text-ink-subtle">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Portal account since {formatDate(d.createdAt)}
            </p>
          )}
        </aside>
      </div>

      {pwOpen && <PasswordDialog onClose={() => setPwOpen(false)} />}
      {editOpen && d && <EditProfileDialog details={d} onClose={() => setEditOpen(false)} />}
    </div>
  );
}

function EditProfileDialog({ details: d, onClose }: { details: EmployeeDetails; onClose: () => void }) {
  const toast = useToast();
  const { update } = useProfileMutations();
  const p = d.profile;
  const [personalEmail, setPersonalEmail] = useState(real(p?.personalEmail) ?? "");
  const [personalMobile, setPersonalMobile] = useState(real(p?.personalMobile) ?? "");
  const [education, setEducation] = useState(real(p?.education) ?? "");
  const [currentAddress, setCurrentAddress] = useState(real(p?.currentAddress) ?? "");
  const [currentPinCode, setCurrentPinCode] = useState(real(p?.currentPinCode) ?? "");
  const [permanentAddress, setPermanentAddress] = useState(real(p?.permanentAddress) ?? "");
  const [emergencyContactName, setEmergencyContactName] = useState(real(p?.emergencyContactName) ?? "");
  const [emergencyContactRelation, setEmergencyContactRelation] = useState(real(p?.emergencyContactRelation) ?? "");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(real(p?.emergencyContactPhone) ?? "");
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    update.mutate(
      {
        id: d.id,
        body: {
          personalEmail: personalEmail.trim(),
          personalMobile: personalMobile.trim(),
          education: education.trim(),
          currentAddress: currentAddress.trim(),
          currentPinCode: currentPinCode.trim(),
          permanentAddress: permanentAddress.trim(),
          emergencyContactName: emergencyContactName.trim(),
          emergencyContactRelation: emergencyContactRelation.trim(),
          emergencyContactPhone: emergencyContactPhone.trim(),
        },
      },
      {
        onSuccess: () => (toast.success("Profile updated"), onClose()),
        onError: (e) => setError(e instanceof ApiError ? e.message : "Couldn’t update profile."),
      },
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="Edit personal details"
      description="Update your contact, address and emergency contact details."
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
        <FormRow label="Personal email" htmlFor="ep-email">
          <Input id="ep-email" type="email" value={personalEmail} onChange={(e) => setPersonalEmail(e.target.value)} />
        </FormRow>
        <FormRow label="Personal mobile" htmlFor="ep-mob">
          <Input id="ep-mob" value={personalMobile} onChange={(e) => setPersonalMobile(e.target.value)} />
        </FormRow>
        <FormRow label="Education" htmlFor="ep-edu" className="sm:col-span-2">
          <Input id="ep-edu" value={education} onChange={(e) => setEducation(e.target.value)} />
        </FormRow>
        <FormRow label="Current address" htmlFor="ep-caddr" className="sm:col-span-2">
          <Textarea id="ep-caddr" rows={2} value={currentAddress} onChange={(e) => setCurrentAddress(e.target.value)} />
        </FormRow>
        <FormRow label="Current PIN code" htmlFor="ep-pin">
          <Input id="ep-pin" maxLength={6} value={currentPinCode} onChange={(e) => setCurrentPinCode(e.target.value)} />
        </FormRow>
        <FormRow label="Permanent address" htmlFor="ep-paddr" className="sm:col-span-2">
          <Textarea id="ep-paddr" rows={2} value={permanentAddress} onChange={(e) => setPermanentAddress(e.target.value)} />
        </FormRow>
        <FormRow label="Emergency contact name" htmlFor="ep-emname">
          <Input id="ep-emname" value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} />
        </FormRow>
        <FormRow label="Emergency contact relation" htmlFor="ep-emrel">
          <Input id="ep-emrel" value={emergencyContactRelation} onChange={(e) => setEmergencyContactRelation(e.target.value)} />
        </FormRow>
        <FormRow label="Emergency contact phone" htmlFor="ep-emph" className="sm:col-span-2">
          <Input id="ep-emph" value={emergencyContactPhone} onChange={(e) => setEmergencyContactPhone(e.target.value)} />
        </FormRow>
        {error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger sm:col-span-2">{error}</p>}
        <button type="submit" className="sr-only">
          Save changes
        </button>
      </form>
    </Dialog>
  );
}

function Section({ icon, title, description, loading, children }: { icon: typeof Briefcase; title: string; description?: string; loading?: boolean; children: ReactNode }) {
  return (
    <Card>
      <CardHeader icon={icon} title={title} description={description} />
      {loading ? <Skeleton className="m-5 h-28" /> : <dl className="grid gap-x-6 gap-y-4 p-5 sm:grid-cols-2 lg:grid-cols-3">{children}</dl>}
    </Card>
  );
}

function Field({ label, value, wide }: { label: string; value: string | null | undefined; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2 lg:col-span-3" : undefined}>
      <dt className="text-xs text-ink-subtle">{label}</dt>
      <dd className={value ? "mt-0.5 break-words text-sm text-ink" : "mt-0.5 text-sm italic text-ink-subtle"}>{value || "Not on record"}</dd>
    </div>
  );
}

function People({ label, people }: { label: string; people?: EmployeeDetails["managers"] }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{label}</p>
      {!people?.length ? (
        <p className="text-sm italic text-ink-subtle">None assigned</p>
      ) : (
        <ul className="space-y-2">
          {people.map((x) => (
            <li key={x.id} className="flex items-center gap-2.5">
              <Avatar name={x.name} size={30} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">{x.name}</span>
                <span className="block text-xs text-ink-subtle">{x.employeeCode}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PasswordDialog({ onClose }: { onClose: () => void }) {
  const { logout } = useAuth();
  const { password } = useProfileMutations();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    if (!current) return setError("Enter your current password.");
    if (next.length < 8) return setError("Use at least 8 characters for the new password.");
    if (!/[A-Za-z]/.test(next) || !/\d/.test(next)) return setError("Include at least one letter and one number.");
    if (next === current) return setError("The new password must be different from the current one.");
    if (next !== confirm) return setError("The new passwords don’t match.");
    password.mutate(
      { currentPassword: current, newPassword: next },
      {
        // The server ends every session after a password change, so sign out cleanly here.
        onSuccess: () => logout("password"),
        onError: (e) => setError(e instanceof ApiError ? e.message : "Couldn’t change the password."),
      },
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title="Change password"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={password.isPending}>
            Cancel
          </Button>
          <Button onClick={save} loading={password.isPending}>
            Update password
          </Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(e) => (e.preventDefault(), save())}>
        <FormRow label="Current password" htmlFor="pw-cur" required>
          <Input id="pw-cur" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </FormRow>
        <FormRow label="New password" htmlFor="pw-new" required hint="At least 8 characters, with a letter and a number.">
          <Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </FormRow>
        <FormRow label="Confirm new password" htmlFor="pw-conf" required>
          <Input id="pw-conf" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </FormRow>
        {error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
        <button type="submit" className="sr-only">
          Update password
        </button>
      </form>
    </Dialog>
  );
}
