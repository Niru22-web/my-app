"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useQuery({
    queryKey: ["reset-token", token],
    queryFn: () => api("auth/validate-reset-token", { query: { token }, anonymous: true }),
    enabled: !!token,
    retry: false,
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) return setError("Use at least 8 characters.");
    if (pw !== confirm) return setError("Passwords don’t match.");
    setBusy(true);
    try {
      await api("auth/reset-password", { method: "POST", body: { token, newPassword: pw }, anonymous: true });
      router.replace("/login?reason=reset");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  if (token && check.isLoading) return <p className="text-sm text-ink-muted">Checking your reset link…</p>;
  if (!token || check.isError)
    return (
      <div>
        <h1 className="font-display text-[26px] font-bold text-ink">Link expired</h1>
        <p className="mt-2 text-[15px] text-ink-muted">This reset link is invalid or has expired. Request a new one.</p>
        <Link href="/forgot-password" className="mt-6 inline-block text-sm font-semibold text-brand hover:underline">
          Request a new link
        </Link>
      </div>
    );

  return (
    <div>
      <h1 className="font-display text-[28px] font-bold text-ink">Choose a new password</h1>
      <form onSubmit={onSubmit} className="mt-7 space-y-4" noValidate>
        <Field label="New password" name="password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <Field label="Confirm password" name="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {error && <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">{error}</p>}
        <Button type="submit" size="lg" loading={busy} className="w-full justify-center">
          Update password
        </Button>
      </form>
    </div>
  );
}
