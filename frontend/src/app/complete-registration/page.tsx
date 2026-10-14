"use client";

import { Suspense, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock, ShieldCheck } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { today } from "@/lib/dates";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormRow, Input, Select, Textarea } from "@/components/ui/inputs";
import { FileDrop } from "@/components/ui/file-drop";
import { Stepper } from "@/components/ui/stepper";
import { Skeleton } from "@/components/ui/skeleton";

interface Invite {
  valid: boolean;
  email: string;
  firstName: string;
  lastName: string | null;
  employeeId: string;
}

const REASONS: Record<string, string> = {
  missing: "This link is incomplete. Open it again from your invitation email.",
  not_found: "This link isn’t valid. Ask HR to send a new invitation.",
  used: "This link has already been used. If you set your password, sign in instead.",
  expired: "This link has expired. Ask HR to send a new invitation.",
};

// Same rules the server enforces (employeeProfile.controller.ts), plus common Indian formats.
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const AADHAAR = /^\d{12}$/;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT = /^\d{9,18}$/;
const MOBILE = /^[6-9]\d{9}$/;
const PIN = /^\d{6}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOC = ".pdf,.jpg,.jpeg,.png";
const PHOTO = ".jpg,.jpeg,.png,.webp";

export default function CompleteRegistrationPage() {
  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Logo priority className="w-[130px]" />
          <Link href="/login" className="text-sm font-semibold text-brand hover:underline">
            Sign in
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <Suspense fallback={<Skeleton className="h-96" />}>
          <Registration />
        </Suspense>
      </main>
    </div>
  );
}

function Registration() {
  const token = useSearchParams().get("token") ?? "";
  const invite = useQuery({
    queryKey: ["registration-token", token],
    queryFn: () => api<Invite>("auth/validate-registration-token", { query: { token }, anonymous: true }),
    enabled: !!token,
    retry: false,
  });
  const [done, setDone] = useState(false);

  if (invite.isError && !(invite.error instanceof ApiError && invite.error.status < 500))
    return (
      <Message icon={<Clock className="h-6 w-6" />} title="We couldn’t check your link">
        The portal didn’t respond. Please try again in a minute.{" "}
        <button onClick={() => invite.refetch()} className="font-semibold text-brand hover:underline">
          Try again
        </button>
      </Message>
    );
  if (!token || invite.isError) {
    const reason = invite.error instanceof ApiError ? ((invite.error.body as { reason?: string })?.reason ?? "") : "missing";
    return (
      <Message icon={<Clock className="h-6 w-6" />} title="We can’t open this registration link">
        {REASONS[reason] ?? REASONS.not_found}
      </Message>
    );
  }
  if (invite.isLoading || !invite.data) return <Skeleton className="h-96" />;
  if (done)
    return (
      <Message icon={<CheckCircle2 className="h-6 w-6" />} title="You’re all set" tone="success">
        Your details have been sent to HR. You’ll be able to sign in with <strong>{invite.data.email}</strong> once your account is approved — usually within a working day.
      </Message>
    );
  return <Wizard invite={invite.data} token={token} onDone={() => setDone(true)} />;
}

function Message({ icon, title, children, tone = "neutral" }: { icon: ReactNode; title: string; children: ReactNode; tone?: "neutral" | "success" }) {
  return (
    <Card className="p-8 text-center">
      <span className={`mx-auto grid h-12 w-12 place-items-center rounded-2xl ${tone === "success" ? "bg-success/10 text-success" : "bg-brand-softer text-brand"}`}>{icon}</span>
      <h1 className="mt-4 font-display text-2xl font-bold text-ink">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-[15px] text-ink-muted">{children}</p>
      <Link href="/login" className="mt-6 inline-block text-sm font-semibold text-brand hover:underline">
        Go to sign in
      </Link>
    </Card>
  );
}

type Form = Record<
  | "password"
  | "confirmPassword"
  | "dob"
  | "doj"
  | "gender"
  | "maritalStatus"
  | "education"
  | "personalEmail"
  | "personalMobile"
  | "currentAddress"
  | "currentPinCode"
  | "permanentAddress"
  | "guardianName"
  | "guardianNumber"
  | "guardianAddress"
  | "pan"
  | "aadhaar"
  | "bankName"
  | "accountHolderName"
  | "bankAccountNumber"
  | "ifscCode"
  | "branchName",
  string
>;
// `profileImage` is the field the server's required-file check reads (the committed backend accepts it).
type Files = { panFile: File[]; aadhaarFile: File[]; profileImage: File[]; bankStatementFile: File[] };

const STEPS = ["Account", "About you", "Address", "Documents & bank"];

function ageOn(dob: string, on: string) {
  const [y, m, d] = dob.split("-").map(Number);
  const [Y, M, D] = on.split("-").map(Number);
  return Y - y - (M < m || (M === m && D < d) ? 1 : 0);
}

function Wizard({ invite, token, onDone }: { invite: Invite; token: string; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [tried, setTried] = useState<boolean[]>([false, false, false, false]);
  const [sameAddress, setSame] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [f, setF] = useState<Form>({
    password: "",
    confirmPassword: "",
    dob: "",
    doj: "",
    gender: "",
    maritalStatus: "",
    education: "",
    personalEmail: "",
    personalMobile: "",
    currentAddress: "",
    currentPinCode: "",
    permanentAddress: "",
    guardianName: "",
    guardianNumber: "",
    guardianAddress: "",
    pan: "",
    aadhaar: "",
    bankName: "",
    accountHolderName: `${invite.firstName} ${invite.lastName ?? ""}`.trim(),
    bankAccountNumber: "",
    ifscCode: "",
    branchName: "",
  });
  const [files, setFiles] = useState<Files>({ panFile: [], aadhaarFile: [], profileImage: [], bankStatementFile: [] });
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const now = today();
  const bankStarted = !!(f.bankName || f.bankAccountNumber || f.ifscCode || f.branchName);

  const errors: Record<string, string>[] = [
    {
      password: f.password.length < 8 ? "At least 8 characters." : !/[A-Za-z]/.test(f.password) || !/\d/.test(f.password) ? "Use letters and numbers." : "",
      confirmPassword: f.confirmPassword !== f.password ? "Passwords don’t match." : "",
    },
    {
      dob: !f.dob ? "Required." : f.dob >= now ? "Must be in the past." : ageOn(f.dob, now) < 16 ? "You must be at least 16." : ageOn(f.dob, now) > 80 ? "Check the year." : "",
      doj: !f.doj ? "Required." : f.dob && f.doj <= f.dob ? "Must be after your date of birth." : "",
      gender: !f.gender ? "Required." : "",
      maritalStatus: !f.maritalStatus ? "Required." : "",
      education: !f.education ? "Required." : "",
      personalEmail: f.personalEmail && !EMAIL.test(f.personalEmail.trim()) ? "Enter a valid email." : "",
      personalMobile: f.personalMobile && !MOBILE.test(f.personalMobile.replace(/\D/g, "").slice(-10)) ? "Enter a 10-digit mobile number." : "",
    },
    {
      currentAddress: f.currentAddress.trim().length < 10 ? "Enter your full address." : "",
      currentPinCode: f.currentPinCode && !PIN.test(f.currentPinCode) ? "6 digits." : "",
      permanentAddress: !sameAddress && f.permanentAddress.trim().length < 10 ? "Enter your full address." : "",
      guardianNumber: f.guardianNumber && !MOBILE.test(f.guardianNumber.replace(/\D/g, "").slice(-10)) ? "Enter a 10-digit number." : "",
    },
    {
      pan: !PAN.test(f.pan.trim().toUpperCase()) ? "Format: ABCDE1234F." : "",
      aadhaar: !AADHAAR.test(f.aadhaar.replace(/\s/g, "")) ? "12 digits." : "",
      panFile: !files.panFile.length ? "Upload your PAN card." : "",
      aadhaarFile: !files.aadhaarFile.length ? "Upload your Aadhaar card." : "",
      profilePhoto: !files.profileImage.length ? "Upload a photo." : "",
      bankName: bankStarted && !f.bankName.trim() ? "Required when adding bank details." : "",
      bankAccountNumber: bankStarted && !ACCOUNT.test(f.bankAccountNumber) ? "9–18 digits." : "",
      ifscCode: bankStarted && !IFSC.test(f.ifscCode.trim().toUpperCase()) ? "Format: SBIN0001234." : "",
      accountHolderName: bankStarted && !f.accountHolderName.trim() ? "Required." : "",
    },
  ];
  const e = errors[step];
  const show = (k: string) => (tried[step] ? errors[step][k] || undefined : undefined);
  const ok = (i: number) => !Object.values(errors[i]).some(Boolean);

  function next(ev: FormEvent) {
    ev.preventDefault();
    setTried((t) => t.map((v, i) => (i === step ? true : v)));
    if (!ok(step)) return;
    if (step < 3) {
      setStep(step + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else void submit();
  }

  async function submit() {
    setBusy(true);
    setServerError(null);
    const fd = new FormData();
    fd.append("token", token);
    const clean: Form = {
      ...f,
      pan: f.pan.trim().toUpperCase(),
      aadhaar: f.aadhaar.replace(/\s/g, ""),
      ifscCode: f.ifscCode.trim().toUpperCase(),
      personalMobile: f.personalMobile.replace(/\D/g, "").slice(-10),
      guardianNumber: f.guardianNumber.replace(/\D/g, "").slice(-10),
      permanentAddress: sameAddress ? f.currentAddress : f.permanentAddress,
    };
    for (const [k, v] of Object.entries(clean)) if (v.trim()) fd.append(k, v.trim());
    for (const [k, list] of Object.entries(files) as [keyof Files, File[]][]) if (list[0]) fd.append(k, list[0]);
    try {
      await api("auth/complete-registration", { method: "POST", body: fd, anonymous: true });
      onDone();
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-brand">Welcome to Ashish Shah &amp; Associates</p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight text-ink">Hi {invite.firstName}, let’s set up your account</h1>
        <p className="mt-2 text-[15px] text-ink-muted">
          {invite.email} · {invite.employeeId}. It takes about five minutes — keep your PAN, Aadhaar and a photo handy.
        </p>
      </div>

      <Stepper steps={STEPS.map((label, i) => ({ label, state: i < step ? "done" : i === step ? "current" : "upcoming" }))} />

      <Card className="p-5 sm:p-7">
        <form onSubmit={next} noValidate className="grid gap-4 sm:grid-cols-2">
          {step === 0 && (
            <>
              <p className="text-[13px] text-ink-muted sm:col-span-2">You’ll sign in with your office email and this password.</p>
              <FormRow label="Password" htmlFor="rg-pw" required error={show("password")} hint="At least 8 characters, with letters and numbers">
                <Input id="rg-pw" type="password" autoComplete="new-password" value={f.password} onChange={set("password")} invalid={!!show("password")} />
              </FormRow>
              <FormRow label="Confirm password" htmlFor="rg-pw2" required error={show("confirmPassword")}>
                <Input id="rg-pw2" type="password" autoComplete="new-password" value={f.confirmPassword} onChange={set("confirmPassword")} invalid={!!show("confirmPassword")} />
              </FormRow>
            </>
          )}

          {step === 1 && (
            <>
              <FormRow label="Date of birth" htmlFor="rg-dob" required error={show("dob")}>
                <Input id="rg-dob" type="date" max={now} value={f.dob} onChange={set("dob")} invalid={!!show("dob")} />
              </FormRow>
              <FormRow label="Date of joining" htmlFor="rg-doj" required error={show("doj")}>
                <Input id="rg-doj" type="date" value={f.doj} onChange={set("doj")} invalid={!!show("doj")} />
              </FormRow>
              <FormRow label="Gender" htmlFor="rg-gender" required error={show("gender")}>
                <Select id="rg-gender" value={f.gender} onChange={set("gender")} invalid={!!show("gender")}>
                  <option value="">Choose…</option>
                  {["Male", "Female", "Other"].map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </Select>
              </FormRow>
              <FormRow label="Marital status" htmlFor="rg-ms" required error={show("maritalStatus")}>
                <Select id="rg-ms" value={f.maritalStatus} onChange={set("maritalStatus")} invalid={!!show("maritalStatus")}>
                  <option value="">Choose…</option>
                  {["Single", "Married", "Divorced", "Widowed"].map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </Select>
              </FormRow>
              <FormRow label="Highest education" htmlFor="rg-edu" required error={show("education")}>
                <Select id="rg-edu" value={f.education} onChange={set("education")} invalid={!!show("education")}>
                  <option value="">Choose…</option>
                  {["Post Graduate", "Graduate", "Diploma", "HSC", "SSC", "Other"].map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </Select>
              </FormRow>
              <FormRow label="Personal mobile" htmlFor="rg-mob" error={show("personalMobile")} hint="Optional">
                <Input id="rg-mob" type="tel" inputMode="numeric" value={f.personalMobile} onChange={set("personalMobile")} invalid={!!show("personalMobile")} />
              </FormRow>
              <FormRow label="Personal email" htmlFor="rg-pem" error={show("personalEmail")} hint="Optional" className="sm:col-span-2">
                <Input id="rg-pem" type="email" value={f.personalEmail} onChange={set("personalEmail")} invalid={!!show("personalEmail")} />
              </FormRow>
            </>
          )}

          {step === 2 && (
            <>
              <FormRow label="Current address" htmlFor="rg-cur" required error={show("currentAddress")} className="sm:col-span-2">
                <Textarea id="rg-cur" rows={3} value={f.currentAddress} onChange={set("currentAddress")} invalid={!!show("currentAddress")} />
              </FormRow>
              <FormRow label="PIN code" htmlFor="rg-pin" error={show("currentPinCode")} hint="Optional">
                <Input id="rg-pin" inputMode="numeric" maxLength={6} value={f.currentPinCode} onChange={set("currentPinCode")} invalid={!!show("currentPinCode")} />
              </FormRow>
              <label className="flex items-center gap-2 self-end pb-2.5 text-sm text-ink">
                <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={sameAddress} onChange={(ev) => setSame(ev.target.checked)} />
                Permanent address is the same
              </label>
              {!sameAddress && (
                <FormRow label="Permanent address" htmlFor="rg-perm" required error={show("permanentAddress")} className="sm:col-span-2">
                  <Textarea id="rg-perm" rows={3} value={f.permanentAddress} onChange={set("permanentAddress")} invalid={!!show("permanentAddress")} />
                </FormRow>
              )}
              <p className="pt-2 text-sm font-semibold text-ink sm:col-span-2">Emergency contact (optional)</p>
              <FormRow label="Name" htmlFor="rg-gn">
                <Input id="rg-gn" value={f.guardianName} onChange={set("guardianName")} />
              </FormRow>
              <FormRow label="Phone" htmlFor="rg-gp" error={show("guardianNumber")}>
                <Input id="rg-gp" type="tel" inputMode="numeric" value={f.guardianNumber} onChange={set("guardianNumber")} invalid={!!show("guardianNumber")} />
              </FormRow>
              <FormRow label="Their address" htmlFor="rg-ga" className="sm:col-span-2">
                <Input id="rg-ga" value={f.guardianAddress} onChange={set("guardianAddress")} />
              </FormRow>
            </>
          )}

          {step === 3 && (
            <>
              <p className="flex items-start gap-2 rounded-xl bg-surface-muted px-3.5 py-2.5 text-[13px] text-ink-muted sm:col-span-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
                Your documents are used by HR to verify your identity and set up payroll.
              </p>
              <FormRow label="PAN" htmlFor="rg-pan" required error={show("pan")}>
                <Input id="rg-pan" value={f.pan} maxLength={10} onChange={set("pan")} className="uppercase" placeholder="ABCDE1234F" invalid={!!show("pan")} />
              </FormRow>
              <FormRow label="Aadhaar number" htmlFor="rg-aad" required error={show("aadhaar")}>
                <Input id="rg-aad" inputMode="numeric" maxLength={14} value={f.aadhaar} onChange={set("aadhaar")} placeholder="1234 5678 9012" invalid={!!show("aadhaar")} />
              </FormRow>
              <FormRow label="PAN card" htmlFor="rg-panf" required error={show("panFile")}>
                <FileDrop id="rg-panf" files={files.panFile} onChange={(x) => setFiles((p) => ({ ...p, panFile: x.slice(-1) }))} accept={DOC} multiple={false} maxMb={10} hint="PDF, JPG or PNG · up to 10 MB" invalid={!!show("panFile")} />
              </FormRow>
              <FormRow label="Aadhaar card" htmlFor="rg-aadf" required error={show("aadhaarFile")}>
                <FileDrop id="rg-aadf" files={files.aadhaarFile} onChange={(x) => setFiles((p) => ({ ...p, aadhaarFile: x.slice(-1) }))} accept={DOC} multiple={false} maxMb={10} hint="PDF, JPG or PNG · up to 10 MB" invalid={!!show("aadhaarFile")} />
              </FormRow>
              <FormRow label="Your photo" htmlFor="rg-photo" required error={show("profilePhoto")} className="sm:col-span-2">
                <FileDrop id="rg-photo" files={files.profileImage} onChange={(x) => setFiles((p) => ({ ...p, profileImage: x.slice(-1) }))} accept={PHOTO} multiple={false} maxMb={10} hint="A clear, recent photo — JPG, PNG or WEBP" invalid={!!show("profilePhoto")} />
              </FormRow>

              <p className="pt-2 text-sm font-semibold text-ink sm:col-span-2">Salary account (optional — you can give it to HR later)</p>
              <FormRow label="Bank name" htmlFor="rg-bank" error={show("bankName")}>
                <Input id="rg-bank" value={f.bankName} onChange={set("bankName")} invalid={!!show("bankName")} />
              </FormRow>
              <FormRow label="Account holder" htmlFor="rg-holder" error={show("accountHolderName")}>
                <Input id="rg-holder" value={f.accountHolderName} onChange={set("accountHolderName")} invalid={!!show("accountHolderName")} />
              </FormRow>
              <FormRow label="Account number" htmlFor="rg-acc" error={show("bankAccountNumber")}>
                <Input id="rg-acc" inputMode="numeric" value={f.bankAccountNumber} onChange={set("bankAccountNumber")} invalid={!!show("bankAccountNumber")} />
              </FormRow>
              <FormRow label="IFSC" htmlFor="rg-ifsc" error={show("ifscCode")}>
                <Input id="rg-ifsc" value={f.ifscCode} maxLength={11} onChange={set("ifscCode")} className="uppercase" placeholder="SBIN0001234" invalid={!!show("ifscCode")} />
              </FormRow>
              <FormRow label="Branch" htmlFor="rg-branch">
                <Input id="rg-branch" value={f.branchName} onChange={set("branchName")} />
              </FormRow>
              <FormRow label="Cancelled cheque or statement" htmlFor="rg-stmt" hint="Optional">
                <FileDrop id="rg-stmt" files={files.bankStatementFile} onChange={(x) => setFiles((p) => ({ ...p, bankStatementFile: x.slice(-1) }))} accept={DOC} multiple={false} maxMb={10} />
              </FormRow>
            </>
          )}

          {serverError && (
            <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger sm:col-span-2">
              {serverError}
            </p>
          )}
          {tried[step] && Object.values(e).some(Boolean) && <p className="text-[13px] text-danger sm:col-span-2">Please fix the highlighted fields.</p>}

          <div className="flex items-center justify-between gap-3 pt-2 sm:col-span-2">
            {step > 0 ? (
              <Button type="button" variant="ghost" onClick={() => setStep(step - 1)}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" loading={busy}>
              {step < 3 ? (
                <>
                  Continue <ArrowRight className="h-4 w-4" />
                </>
              ) : (
                "Finish registration"
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
