"use client";

import Link from "next/link";
import { assetUrl } from "@/lib/api";
import { timeAgo } from "@/lib/notifications";
import { Avatar } from "@/components/ui/avatar";
import { EnvChip } from "./chips";
import { eventSentence, type BugEvent } from "./api";

/** Feed rows: avatar, "Niranjan moved BUG-… from Resolved to Reopened", environment, time. */
export function ActivityList({ events }: { events: BugEvent[] }) {
  return (
    <ul className="divide-y divide-line/70">
      {events.map((e) => (
        <li key={e.id}>
          <Link href={`/bugs/${e.bugId}`} className="flex items-start gap-3 rounded-lg px-1 py-3 hover:bg-surface-muted/60 focus-visible:outline-2 focus-visible:outline-brand">
            <Avatar name={e.actor.name} src={assetUrl(e.actor.profileImage)} size={32} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink">
                <span className="font-semibold">{e.actor.name}</span> <span className="text-ink-muted">{eventSentence(e, { withCode: true })}</span>
              </p>
              {e.bugTitle && <p className="truncate text-xs text-ink-subtle">{e.bugTitle}</p>}
            </div>
            <span className="flex shrink-0 flex-col items-end gap-1">
              {e.environment && <EnvChip env={e.environment} />}
              <time className="text-[11px] text-ink-subtle" dateTime={e.createdAt} title={new Date(e.createdAt).toLocaleString("en-IN")}>
                {timeAgo(e.createdAt)}
              </time>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
