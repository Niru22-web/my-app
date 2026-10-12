"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessagesSquare, Send } from "lucide-react";
import { api, assetUrl } from "@/lib/api";
import { acquireSocket, releaseSocket } from "@/lib/socket";
import { useAuth } from "@/lib/auth";
import type { Envelope } from "@/lib/types";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

interface TeamMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string | null;
  senderImage: string | null;
  content: string;
  createdAt: string;
}

const KEY = ["team-chat"];

export function TeamChat() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const list = useRef<HTMLDivElement>(null);

  const q = useQuery({ queryKey: KEY, queryFn: async () => (await api<Envelope<TeamMessage[]>>("chat")).data ?? [] });

  useEffect(() => {
    const socket = acquireSocket();
    const onMessage = (m: TeamMessage) =>
      qc.setQueryData<TeamMessage[]>(KEY, (prev = []) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));
    socket.on("new_team_message", onMessage);
    return () => {
      socket.off("new_team_message", onMessage);
      releaseSocket();
    };
  }, [qc]);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [q.data?.length]);

  const send = useMutation({
    mutationFn: (content: string) => api<Envelope<TeamMessage>>("chat", { method: "POST", body: { content } }),
    onSuccess: (res) => {
      setText("");
      qc.setQueryData<TeamMessage[]>(KEY, (prev = []) => (prev.some((p) => p.id === res.data.id) ? prev : [...prev, res.data]));
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const c = text.trim();
    if (c) send.mutate(c);
  };

  const msgs = q.data ?? [];

  return (
    <Card className="flex h-[440px] flex-col">
      <CardHeader icon={MessagesSquare} title="Team hub" description="Firm-wide chat — visible to everyone" />
      <div ref={list} className="mt-3 flex-1 space-y-3 overflow-y-auto px-5 pb-2">
        {q.isLoading ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)
        ) : msgs.length === 0 ? (
          <EmptyState icon={MessagesSquare} title="No messages yet" description="Start the conversation." />
        ) : (
          msgs.map((m) => {
            const mine = m.senderId === user?.id;
            return (
              <div key={m.id} className={cn("flex gap-2.5", mine && "flex-row-reverse")}>
                <Avatar name={m.senderName} src={assetUrl(m.senderImage)} size={30} />
                <div className={cn("max-w-[78%]", mine && "text-right")}>
                  <p className="mb-0.5 text-[11px] text-ink-subtle">
                    {mine ? "You" : m.senderName} · {formatTime(m.createdAt)}
                  </p>
                  <p
                    className={cn(
                      "inline-block whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-left text-[13px]",
                      mine ? "rounded-tr-md bg-brand text-brand-ink" : "rounded-tl-md bg-surface-muted text-ink",
                    )}
                  >
                    {m.content}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
      <form onSubmit={onSubmit} className="flex items-center gap-2 border-t border-line p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a message…"
          maxLength={1000}
          aria-label="Message"
          className="h-10 flex-1 rounded-xl border border-line bg-surface-muted px-3 text-sm text-ink outline-none focus:border-brand"
        />
        <button
          type="submit"
          disabled={!text.trim() || send.isPending}
          className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-brand-ink hover:bg-brand-hover disabled:opacity-50"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </Card>
  );
}
