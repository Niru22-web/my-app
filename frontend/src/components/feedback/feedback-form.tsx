"use client";

import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { HelpCircle, Lightbulb, MoreHorizontal, Send, Star, ThumbsUp, TriangleAlert, type LucideIcon } from "lucide-react";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { FormRow, Select, Textarea } from "@/components/ui/inputs";
import { useToast } from "@/components/ui/toast";
import { CATEGORIES, CATEGORY_HINT, MODULES, useFeedbackMutations, type FeedbackCategory } from "./api";

const ICONS: Record<FeedbackCategory, LucideIcon> = { Idea: Lightbulb, Problem: TriangleAlert, Praise: ThumbsUp, Question: HelpCircle, Other: MoreHorizontal };
const MAX = 2000;

/** Arrow keys move between options of a radio group (roving tab index). */
function arrowNav(e: KeyboardEvent<HTMLElement>, count: number, index: number, pick: (i: number) => void) {
  const k = e.key;
  if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(k)) return;
  e.preventDefault();
  const next = k === "Home" ? 0 : k === "End" ? count - 1 : (index + (k === "ArrowRight" || k === "ArrowDown" ? 1 : -1) + count) % count;
  pick(next);
  const group = e.currentTarget.parentElement;
  (group?.children[next] as HTMLElement | undefined)?.focus();
}

export function StarRating({ value, onChange, labelledBy }: { value: number | null; onChange: (v: number | null) => void; labelledBy: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="flex items-center gap-0.5" onMouseLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          tabIndex={(value ?? 1) === n ? 0 : -1}
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange(value === n ? null : n)}
          onKeyDown={(e) => arrowNav(e, 5, n - 1, (i) => onChange(i + 1))}
          className="grid h-9 w-9 place-items-center rounded-lg focus-visible:outline-2 focus-visible:outline-brand"
        >
          <Star className={cn("h-6 w-6 transition-colors", n <= shown ? "fill-amber-400 text-amber-400" : "text-line-strong")} aria-hidden />
        </button>
      ))}
      {value != null && (
        <button type="button" onClick={() => onChange(null)} className="ml-2 text-xs font-medium text-ink-subtle hover:text-ink">
          Clear
        </button>
      )}
    </div>
  );
}

export function FeedbackForm({
  defaultModule = "",
  pageUrl,
  compact,
  onSent,
  onCancel,
}: {
  defaultModule?: string;
  pageUrl?: string;
  compact?: boolean;
  onSent?: () => void;
  onCancel?: () => void;
}) {
  const uid = useId();
  const toast = useToast();
  const { send } = useFeedbackMutations();
  const [category, setCategory] = useState<FeedbackCategory>("Idea");
  const [rating, setRating] = useState<number | null>(null);
  const [module, setModule] = useState(defaultModule);
  const [message, setMessage] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const msgRef = useRef<HTMLTextAreaElement>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const text = message.trim();
    if (text.length < 5) {
      setError("Tell us a little more — at least 5 characters.");
      msgRef.current?.focus();
      return;
    }
    setError(null);
    try {
      const res = await send.mutateAsync({ category, rating, message: text, module: module || undefined, pageUrl, anonymous });
      toast.success("Feedback sent", res.message ?? "Thank you.");
      setMessage("");
      setRating(null);
      setAnonymous(false);
      onSent?.();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Couldn’t send your feedback.";
      setError(msg);
      toast.error("Couldn’t send", msg);
    }
  }

  const catIndex = CATEGORIES.indexOf(category);

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <p id={`${uid}-cat`} className="mb-1.5 text-[13px] font-medium text-ink">
          What kind of feedback?
        </p>
        <div role="radiogroup" aria-labelledby={`${uid}-cat`} className="grid grid-cols-5 gap-1 rounded-xl border border-line bg-surface-muted p-1">
          {CATEGORIES.map((c) => {
            const Icon = ICONS[c];
            const on = c === category;
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                title={CATEGORY_HINT[c]}
                onClick={() => setCategory(c)}
                onKeyDown={(e) => arrowNav(e, CATEGORIES.length, catIndex, (k) => setCategory(CATEGORIES[k]))}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[12px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-brand",
                  on ? "bg-brand text-brand-ink shadow-sm" : "text-ink-muted hover:bg-surface hover:text-ink",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {c}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-ink-subtle">{CATEGORY_HINT[category]}.</p>
      </div>

      <div className={cn("grid gap-4", !compact && "sm:grid-cols-2")}>
        <div>
          <p id={`${uid}-rate`} className="mb-1 text-[13px] font-medium text-ink">
            How would you rate it? <span className="font-normal text-ink-subtle">(optional)</span>
          </p>
          <StarRating value={rating} onChange={setRating} labelledBy={`${uid}-rate`} />
        </div>
        <FormRow label="Which part of the portal?" htmlFor={`${uid}-module`}>
          <Select id={`${uid}-module`} value={module} onChange={(e) => setModule(e.target.value)}>
            <option value="">Not specific</option>
            {MODULES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </FormRow>
      </div>

      <FormRow
        label="Your message"
        htmlFor={`${uid}-msg`}
        required
        error={error ?? undefined}
        hint={
          <span className="flex justify-between gap-2">
            <span>{category === "Problem" ? "What did you do, and what happened?" : "Plain words are perfect."}</span>
            <span className="tabular">
              {message.length}/{MAX}
            </span>
          </span>
        }
      >
        <Textarea
          ref={msgRef}
          id={`${uid}-msg`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={compact ? 4 : 5}
          maxLength={MAX}
          invalid={!!error}
          aria-describedby={error ? `${uid}-msg-error` : undefined}
          placeholder={category === "Praise" ? "What do you like?" : category === "Question" ? "What would you like to know?" : "Tell us what you think…"}
        />
      </FormRow>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink">
          <button
            type="button"
            role="switch"
            aria-checked={anonymous}
            onClick={() => setAnonymous((v) => !v)}
            className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand", anonymous ? "bg-brand" : "bg-line-strong")}
          >
            <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", anonymous ? "left-[18px]" : "left-0.5")} />
          </button>
          <span>
            Send anonymously
            <span className="block text-xs text-ink-subtle">Reviewers won’t see your name. You can still follow it here.</span>
          </span>
        </label>
        <div className="flex gap-2">
          {onCancel && (
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" loading={send.isPending}>
            <Send className="h-4 w-4" aria-hidden /> Send feedback
          </Button>
        </div>
      </div>
    </form>
  );
}
