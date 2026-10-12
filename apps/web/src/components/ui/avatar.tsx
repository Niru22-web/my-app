"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

export function Avatar({ name, src, size = 36, className }: { name?: string | null; src?: string | null; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, fontSize: Math.max(11, size * 0.38) };
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- user photos come from the API's /uploads, not the image optimiser
      <img
        src={src}
        alt={name ?? ""}
        style={style}
        onError={() => setFailed(true)}
        className={cn("shrink-0 rounded-full object-cover ring-2 ring-surface", className)}
      />
    );
  }
  return (
    <span
      style={style}
      aria-hidden
      className={cn("grid shrink-0 place-items-center rounded-full bg-brand font-semibold text-brand-ink ring-2 ring-surface", className)}
    >
      {initials(name)}
    </span>
  );
}
