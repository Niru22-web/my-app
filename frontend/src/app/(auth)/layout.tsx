import { LifeBuoy } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { AuthShowcase } from "@/components/auth/auth-showcase";
import { IT_HELPDESK_EMAIL } from "@/lib/contacts";

/** Full-screen split: photo showcase on the left (desktop only), form on the right. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen bg-surface lg:h-screen lg:grid-cols-[1.25fr_1fr] lg:overflow-hidden">
      <AuthShowcase />

      <section className="flex min-h-screen flex-col overflow-y-auto px-6 py-8 sm:px-10 lg:min-h-0 xl:px-20">
        <Logo priority className="w-[132px]" />

        <div className="flex flex-1 items-center py-10">
          <div className="mx-auto w-full max-w-[420px]">{children}</div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-ink-subtle">
          <a
            href={`mailto:${IT_HELPDESK_EMAIL}?subject=${encodeURIComponent("ASA Portal sign-in help")}`}
            className="inline-flex items-center gap-1.5 font-medium text-ink-muted hover:text-brand"
          >
            <LifeBuoy className="h-4 w-4" aria-hidden /> Need help? {IT_HELPDESK_EMAIL}
          </a>
          <span>© {new Date().getFullYear()} Ashish Shah &amp; Associates</span>
        </div>
      </section>
    </div>
  );
}
