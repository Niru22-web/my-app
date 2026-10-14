"use client";

import { useEffect, useState, type ReactNode } from "react";
import { openFile, protectedFileUrl } from "@/lib/api";
import { useToast } from "@/components/ui/toast";

/** Thumbnail for a protected image (e.g. a ticket attachment) — loaded with the login, not a bare URL. */
export function ProtectedImage({ path, className }: { path: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    let live = true;
    protectedFileUrl(path)
      .then((u) => {
        url = u;
        if (live) setSrc(u);
      })
      .catch(() => {});
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [path]);
  // eslint-disable-next-line @next/next/no-img-element -- blob URL of a user upload
  return src ? <img src={src} alt="" className={className} /> : <span className={className} aria-hidden />;
}

/** Link-styled button that opens a protected file in a new tab. */
export function FileLink({ path, className, children, title }: { path: string; className?: string; children: ReactNode; title?: string }) {
  const toast = useToast();
  return (
    <button
      type="button"
      title={title}
      className={className}
      onClick={() => openFile(path).catch((e: Error) => toast.error("Couldn’t open the file", e.message))}
    >
      {children}
    </button>
  );
}
