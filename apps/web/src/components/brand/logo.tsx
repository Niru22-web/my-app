import Image from "next/image";
import { cn } from "@/lib/cn";

/** Full ASA wordmark. In dark mode it is rendered as a white monochrome mark for contrast. */
export function Logo({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/brand/asa-logo.webp"
      alt="Ashish Shah & Associates — Delivering Value"
      width={626}
      height={233}
      priority={priority}
      className={cn("h-auto w-[148px] select-none dark:brightness-0 dark:invert", className)}
    />
  );
}

/** Square ASA mark for collapsed navigation and small spaces. */
export function LogoMark({ size = 36, className, eager }: { size?: number; className?: string; eager?: boolean }) {
  return (
    <Image
      src="/brand/icon-192.png"
      alt="ASA"
      width={size}
      height={size}
      loading={eager ? "eager" : undefined}
      className={cn("select-none rounded-[10px]", className)}
    />
  );
}
