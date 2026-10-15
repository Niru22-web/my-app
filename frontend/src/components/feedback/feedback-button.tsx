"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquareHeart } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { guessModule } from "./api";
import { FeedbackForm } from "./feedback-form";

/** Small floating "Feedback" button (bottom-right). Mount once in the portal layout. */
export function FeedbackButton() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  if (pathname.startsWith("/feedback")) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/95 px-3 py-2 text-[13px] font-semibold text-ink-muted shadow-pop backdrop-blur transition-colors hover:border-brand/40 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand print:hidden"
        aria-haspopup="dialog"
      >
        <MessageSquareHeart className="h-4 w-4 text-brand" aria-hidden />
        Feedback
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Send feedback"
        description={
          <>
            Ideas, problems or praise — the team reads every message.{" "}
            <Link href="/feedback" onClick={() => setOpen(false)} className="font-medium text-brand hover:underline">
              See your feedback
            </Link>
          </>
        }
      >
        <FeedbackForm compact key={pathname} defaultModule={guessModule(pathname)} pageUrl={pathname} onSent={() => setOpen(false)} onCancel={() => setOpen(false)} />
      </Dialog>
    </>
  );
}
