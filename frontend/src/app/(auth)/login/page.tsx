"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Info } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

const MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: "Email or password is incorrect. New joiners: use the link in your invitation to set a password.",
  TOO_MANY_ATTEMPTS: "Too many sign-in attempts. Please wait a few minutes and try again.",
  ACCOUNT_DISABLED: "This account has been disabled. Contact HR or IT.",
  ACCOUNT_PENDING: "Your account is awaiting approval.",
  ACCOUNT_REJECTED: "Your registration was not approved. Contact HR.",
  ACCOUNT_INACTIVE: "This account is inactive. Contact HR or IT.",
};

const NOTICES: Record<string, string> = {
  expired: "Your session expired. Please sign in again.",
  inactive: "You were signed out after 15 minutes of inactivity.",
  reset: "Password updated. Sign in with your new password.",
  password: "Password changed — you’ve been signed out everywhere. Sign in with your new password.",
};

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { login, status } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rawNext = params.get("next");
  // Only allow same-site relative paths to prevent open redirects.
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";
  const notice = NOTICES[params.get("reason") ?? ""] ?? null;

  useEffect(() => {
    if (status === "authenticated") router.replace(next);
  }, [status, router, next]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.includes("@")) return setError("Enter your office email address.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    setBusy(true);
    try {
      await login(email, password);
      router.replace(next);
    } catch (err) {
      if (err instanceof ApiError) setError((err.code && MESSAGES[err.code]) || err.message);
      else setError("Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="font-display text-[28px] font-bold text-ink">Sign in</h1>
      <p className="mt-1.5 text-[15px] text-ink-muted">Welcome to the ASA Portal. Use your office email to continue.</p>

      {notice && (
        <div className="mt-6 flex gap-2.5 rounded-xl border border-brand/20 bg-brand-softer px-3.5 py-3 text-[13px] text-ink">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
          {notice}
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-7 space-y-4" noValidate>
        <Field
          label="Office email"
          name="email"
          type="email"
          autoComplete="username"
          placeholder="name@asaind.co.in"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
        />
        <Field
          label="Password"
          name="password"
          type={show ? "text" : "password"}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          trailing={
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="grid h-full w-11 place-items-center text-ink-subtle hover:text-ink"
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
            </button>
          }
        />

        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-[13px] font-semibold text-brand hover:underline">
            Forgot password?
          </Link>
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" loading={busy} className="w-full justify-center">
          Sign in
        </Button>
      </form>

      <p className="mt-8 text-center text-xs text-ink-subtle">
        Trouble signing in? Contact the IT team.
      </p>
    </div>
  );
}
