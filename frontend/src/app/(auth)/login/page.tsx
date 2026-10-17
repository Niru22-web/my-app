"use client";

import { Suspense, useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowRight, Eye, EyeOff, Info } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { readLocal, writeLocal } from "@/lib/local-store";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

const MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: "Email or password is incorrect.",
  TOO_MANY_ATTEMPTS: "Too many sign-in attempts. Please wait a few minutes and try again.",
  ACCOUNT_DISABLED: "This account has been disabled. Contact HR or IT.",
  ACCOUNT_PENDING: "Your account is awaiting approval from HR.",
  ACCOUNT_REJECTED: "Your registration was not approved. Contact HR.",
  ACCOUNT_INACTIVE: "This account is inactive. Contact HR or IT.",
};

const NOTICES: Record<string, string> = {
  expired: "Your session expired. Please sign in again.",
  inactive: "You were signed out after 15 minutes without activity, to keep your account safe.",
  reset: "Password updated. Sign in with your new password.",
  password: "Password changed — you’ve been signed out everywhere. Sign in with your new password.",
};

const REMEMBER_KEY = "asa-remember-email";

const greeting = () => {
  const h = Number(new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
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
  const [email, setEmail] = useState(() => readLocal(REMEMBER_KEY) ?? "");
  const [remember, setRemember] = useState(() => !!readLocal(REMEMBER_KEY));
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fieldErr, setFieldErr] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState<{ text: string; code?: string } | null>(null);

  const rawNext = params.get("next");
  // Only allow same-site relative paths to prevent open redirects.
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";
  const notice = NOTICES[params.get("reason") ?? ""] ?? null;

  useEffect(() => {
    if (status === "authenticated") router.replace(next);
  }, [status, router, next]);

  const capsCheck = (e: KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState?.("CapsLock") ?? false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const errs: typeof fieldErr = {};
    const mail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) errs.email = "Enter your office email address.";
    if (!password) errs.password = "Enter your password.";
    setFieldErr(errs);
    if (errs.email || errs.password) return;
    setBusy(true);
    try {
      await login(mail, password);
      writeLocal(REMEMBER_KEY, remember ? mail : null);
      router.replace(next);
    } catch (err) {
      if (err instanceof ApiError) setError({ text: (err.code && MESSAGES[err.code]) || err.message, code: err.code });
      else setError({ text: "We couldn’t reach the portal. Check your connection and try again." });
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-[13px] font-semibold text-brand">{greeting()} 👋</p>
      <h1 className="mt-1.5 font-display text-[30px] font-bold leading-tight text-ink">Welcome to ASA Portal</h1>
      <p className="mt-1.5 text-[15px] leading-relaxed text-ink-muted">Sign in with your office email and password.</p>

      {notice && (
        <div className="mt-5 flex gap-2.5 rounded-xl border border-brand/20 bg-brand-softer px-3.5 py-3 text-[13px] text-ink" role="status">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
          {notice}
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <Field
          label="Office email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          placeholder="name@asaind.co.in"
          value={email}
          error={fieldErr.email}
          onChange={(e) => (setEmail(e.target.value), fieldErr.email && setFieldErr((x) => ({ ...x, email: undefined })))}
          autoFocus={!email}
        />
        <div>
          <Field
            label="Password"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            error={fieldErr.password}
            onChange={(e) => (setPassword(e.target.value), fieldErr.password && setFieldErr((x) => ({ ...x, password: undefined })))}
            onKeyUp={capsCheck}
            onKeyDown={capsCheck}
            onBlur={() => setCaps(false)}
            autoFocus={!!email}
            trailing={
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="grid h-full w-11 place-items-center text-ink-subtle hover:text-ink"
                aria-label={show ? "Hide password" : "Show password"}
                aria-pressed={show}
              >
                {show ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
              </button>
            }
          />
          {caps && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[12px] font-medium text-warning" role="status">
              <AlertCircle className="h-3.5 w-3.5" aria-hidden /> Caps Lock is on
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <label className="inline-flex cursor-pointer select-none items-center gap-2 text-[13px] text-ink-muted">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded border-line-strong accent-[#003887]"
            />
            Remember my email
          </label>
          <Link href="/forgot-password" className="text-[13px] font-semibold text-brand hover:underline">
            Forgot password?
          </Link>
        </div>

        {error && (
          <div role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">
            <p className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{error.text}</span>
            </p>
          </div>
        )}

        <Button type="submit" size="lg" loading={busy} className="!mt-6 w-full justify-center rounded-full">
          Sign in <ArrowRight className="h-4 w-4" aria-hidden />
        </Button>
      </form>
    </div>
  );
}
