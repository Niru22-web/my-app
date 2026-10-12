import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen bg-surface lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <section className="relative hidden overflow-hidden bg-brand lg:flex lg:flex-col lg:justify-between lg:p-12 dark:bg-[#0b1d40]">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -right-32 -top-32 h-[420px] w-[420px] rounded-full border-[56px] border-white/[0.06]" />
          <div className="absolute -bottom-40 -left-24 h-[520px] w-[520px] rounded-full border-[72px] border-white/[0.05]" />
          <div className="absolute bottom-24 right-16 h-2 w-40 rounded-full bg-neutral/60" />
        </div>
        <Logo priority className="relative w-[190px] brightness-0 invert" />
        <div className="relative max-w-md">
          <p className="font-display text-[34px] font-bold leading-tight text-white">
            One portal for time, attendance and operations.
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-white/75">
            Log hours, track attendance, manage approvals and stay on top of compliance — in one place, for every team at
            Ashish Shah &amp; Associates.
          </p>
        </div>
        <p className="relative text-xs text-white/55">© {new Date().getFullYear()} Ashish Shah &amp; Associates. Delivering Value.</p>
      </section>

      {/* Form panel */}
      <section className="flex flex-col items-center justify-center px-5 py-10 sm:px-10">
        <div className="mb-10 lg:hidden">
          <Logo priority className="w-[170px]" />
        </div>
        <div className="w-full max-w-[400px]">{children}</div>
      </section>
    </div>
  );
}
