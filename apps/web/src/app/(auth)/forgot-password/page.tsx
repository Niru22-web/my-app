"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, MailCheck } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.includes("@")) return setError("Enter your office email address.");
    setBusy(true);
    try {
      await api("auth/forgot-password", { method: "POST", body: { email: email.trim().toLowerCase() }, anonymous: true });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Link href="/login" className="mb-8 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-brand">
        <ArrowLeft className="h-4 w-4" /> Back to sign in
      </Link>
      {sent ? (
        <div>
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-success-soft text-success">
            <MailCheck className="h-6 w-6" />
          </span>
          <h1 className="mt-5 font-display text-[26px] font-bold text-ink">Check your inbox</h1>
          <p className="mt-2 text-[15px] text-ink-muted">
            We’ve sent a reset link to <span className="font-semibold text-ink">{email}</span>. It expires in 15 minutes.
          </p>
        </div>
      ) : (
        <>
          <h1 className="font-display text-[28px] font-bold text-ink">Reset your password</h1>
          <p className="mt-1.5 text-[15px] text-ink-muted">Enter your office email and we’ll send you a reset link.</p>
          <form onSubmit={onSubmit} className="mt-7 space-y-4" noValidate>
            <Field label="Office email" name="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            {error && <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">{error}</p>}
            <Button type="submit" size="lg" loading={busy} className="w-full justify-center">
              Send reset link
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
