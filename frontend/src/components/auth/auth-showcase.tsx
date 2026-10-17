"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { CalendarCheck2, ChevronLeft, ChevronRight, Clock3, Headset, Megaphone, ShieldCheck, Timer, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/** Photos live in /public/auth. A slide whose photo is missing falls back to the icon artwork. */
type Slide = { icon: LucideIcon; tag: string; title: string; text: string; photo: string };

const SLIDES: Slide[] = [
  { icon: Timer, tag: "Timesheets", photo: "/auth/timesheets.jpg", title: "Log your hours in seconds.", text: "Pick the client and job, type the hours or run a timer, then submit your week for approval." },
  { icon: Clock3, tag: "Attendance", photo: "/auth/attendance.jpg", title: "Your day, checked in.", text: "Check in and out, see late marks and half days, and request a correction when a punch is missed." },
  { icon: CalendarCheck2, tag: "Leave", photo: "/auth/leave.jpg", title: "Plan time off with your team in view.", text: "Apply for leave, track your balances and see who else is away before you book." },
  { icon: Headset, tag: "Help desk", photo: "/auth/helpdesk.jpg", title: "IT and HR help, one ticket away.", text: "Raise a request, follow every reply and know when to expect an answer." },
  { icon: Megaphone, tag: "Announcements", photo: "/auth/announcements.jpg", title: "Never miss firm news.", text: "Updates, birthdays and festival wishes from across ASA, all in one place." },
];

const INTERVAL = 7000;

export function AuthShowcase() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [missing, setMissing] = useState<Record<string, true>>({});
  const go = (d: number) => setI((x) => (x + d + SLIDES.length) % SLIDES.length);

  useEffect(() => {
    if (paused) return;
    let reduce = false;
    try {
      reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      /* matchMedia unavailable */
    }
    if (reduce) return;
    const t = window.setTimeout(() => setI((x) => (x + 1) % SLIDES.length), INTERVAL);
    return () => window.clearTimeout(t);
  }, [i, paused]);

  const s = SLIDES[i];
  const hasPhoto = !missing[s.photo];

  return (
    <section
      className="relative isolate hidden overflow-hidden bg-brand text-white lg:flex lg:flex-col dark:bg-[#0b1d40]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="What you can do in the portal"
    >
      {/* Photos: all stacked, the current one faded in */}
      {SLIDES.map((sl, k) =>
        missing[sl.photo] ? null : (
          <Image
            key={sl.photo}
            src={sl.photo}
            alt=""
            fill
            sizes="60vw"
            priority={k === 0}
            onError={() => setMissing((m) => ({ ...m, [sl.photo]: true }))}
            className={cn("-z-20 object-cover transition-opacity duration-1000", k === i ? "opacity-100" : "opacity-0")}
          />
        ),
      )}

      {/* Overlay: brand-tinted scrim over photos, decorative pattern otherwise */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {hasPhoto ? (
          <>
            <div className="absolute inset-0 bg-[#001a42]/25" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#001634] via-[#001634]/55 to-transparent" />
            <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/40 to-transparent" />
          </>
        ) : (
          <>
            <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_85%_0%,rgba(120,170,255,0.35),transparent_60%),radial-gradient(90%_70%_at_0%_100%,rgba(0,12,40,0.55),transparent_65%)]" />
            <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]" />
            <div className="absolute -right-24 -top-24 h-[460px] w-[460px] rounded-full border border-white/10" />
            <div className="absolute -right-6 -top-6 h-[300px] w-[300px] rounded-full border border-white/10" />
            <div className="absolute -bottom-48 -left-40 h-[560px] w-[560px] rounded-full border-[80px] border-white/[0.04]" />
          </>
        )}
      </div>

      {/* Top */}
      <div className="flex items-center p-10 xl:p-14">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 text-[12px] font-semibold uppercase tracking-[0.12em] ring-1 ring-white/20 backdrop-blur-md">
          ASA Portal
        </span>
      </div>

      {/* Centre: icon artwork only when there is no photo */}
      <div aria-hidden className="relative flex flex-1 items-center justify-center">
        {!hasPhoto && (
          <div key={`art-${i}`} className="relative animate-[showcase-in_600ms_ease-out_both]">
            <div className="absolute inset-0 -m-10 rounded-full bg-white/[0.06] blur-2xl" />
            <div className="relative grid h-44 w-44 place-items-center rounded-[36px] bg-white/10 ring-1 ring-white/20 backdrop-blur-sm xl:h-52 xl:w-52">
              <s.icon className="h-16 w-16 xl:h-20 xl:w-20" strokeWidth={1.5} />
            </div>
            {SLIDES.filter((_, k) => k !== i)
              .slice(0, 4)
              .map((o, k) => (
                <div
                  key={o.tag}
                  className={cn(
                    "absolute grid h-12 w-12 place-items-center rounded-2xl bg-white/[0.08] ring-1 ring-white/15",
                    ["-left-20 -top-6", "-right-20 top-4", "-left-14 -bottom-12", "-right-12 -bottom-14"][k],
                  )}
                >
                  <o.icon className="h-5 w-5 text-white/70" />
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Bottom: statement + controls */}
      <div className="p-10 pt-0 xl:p-14 xl:pt-0">
        <div key={`txt-${i}`} className="min-h-[200px] animate-[showcase-in_500ms_ease-out_both]" role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${SLIDES.length}: ${s.tag}`}>
          <p className="inline-flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-white/75">
            <s.icon className="h-4 w-4" aria-hidden /> {s.tag}
          </p>
          <p className="mt-3 max-w-[600px] font-display text-[38px] font-bold leading-[1.12] [text-shadow:0_2px_24px_rgba(0,0,0,0.25)] xl:text-[46px]">{s.title}</p>
          <p className="mt-4 max-w-[520px] text-[16px] leading-relaxed text-white/85">{s.text}</p>
        </div>

        <div className="mt-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => go(-1)} aria-label="Previous" className="grid h-11 w-11 place-items-center rounded-full bg-white/5 ring-1 ring-white/50 backdrop-blur-md transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => go(1)} aria-label="Next" className="grid h-11 w-11 place-items-center rounded-full bg-white/5 ring-1 ring-white/50 backdrop-blur-md transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="ml-3 flex items-center gap-1.5">
              {SLIDES.map((o, k) => (
                <button
                  key={o.tag}
                  type="button"
                  onClick={() => setI(k)}
                  aria-label={`Show ${o.tag}`}
                  aria-current={k === i}
                  className={cn("h-1.5 rounded-full transition-all", k === i ? "w-7 bg-white" : "w-1.5 bg-white/40 hover:bg-white/70")}
                />
              ))}
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-white/85">
            <ShieldCheck className="h-4 w-4" aria-hidden /> For ASA staff only
          </span>
        </div>
      </div>
    </section>
  );
}
