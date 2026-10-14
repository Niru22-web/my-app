"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, FolderKanban, Loader2, Search, User } from "lucide-react";
import { api, assetUrl } from "@/lib/api";
import type { Envelope, SearchResults } from "@/lib/types";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Header search trigger + Ctrl/⌘K palette backed by GET /api/search. */
export function GlobalSearch() {
  const [open, setOpenState] = useState(false);
  const [q, setQ] = useState("");
  const term = useDebounced(q.trim(), 300);
  const router = useRouter();

  const setOpen = useCallback((v: boolean) => {
    setOpenState(v);
    if (!v) setQ("");
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  const res = useQuery({
    queryKey: ["search", term],
    queryFn: async () => (await api<Envelope<SearchResults>>("search", { query: { q: term } })).data,
    enabled: open && term.length >= 2,
  });

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const d = res.data;
  const total = d ? d.employees.length + d.projects.length + d.jobs.length : 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Search people, projects and jobs (Ctrl+K)"
        className="hidden h-10 w-[260px] items-center gap-2.5 rounded-xl border border-line bg-surface-muted px-3 text-left text-sm text-ink-subtle transition-colors hover:border-line-strong md:flex"
      >
        <Search className="h-4 w-4" aria-hidden />
        <span className="flex-1 truncate whitespace-nowrap">Search people, projects…</span>
        <kbd className="rounded-md border border-line bg-surface px-1.5 py-0.5 font-sans text-[11px] text-ink-subtle">Ctrl K</kbd>
      </button>
      <button
        onClick={() => setOpen(true)}
        className="grid h-10 w-10 place-items-center rounded-xl text-ink-muted hover:bg-surface-muted md:hidden"
        aria-label="Search"
      >
        <Search className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 px-4 pt-[12vh]" onMouseDown={() => setOpen(false)}>
          <div
            role="dialog"
            aria-label="Search"
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-pop"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="h-5 w-5 text-ink-subtle" aria-hidden />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search employees, projects and jobs"
                className="h-14 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-subtle"
              />
              {res.isFetching && <Loader2 className="h-4 w-4 animate-spin text-ink-subtle" />}
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {term.length < 2 ? (
                <p className="px-3 py-6 text-center text-sm text-ink-subtle">Type at least two characters to search.</p>
              ) : res.isError ? (
                <p className="px-3 py-6 text-center text-sm text-danger">Search is unavailable right now.</p>
              ) : d && total === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-ink-subtle">No matches for “{term}”.</p>
              ) : d ? (
                <>
                  <Group title="People" show={d.employees.length > 0}>
                    {d.employees.map((e) => (
                      <Row key={e.id} onClick={() => go(`/management/employees/edit/${e.id}`)}>
                        <Avatar name={`${e.firstName} ${e.lastName}`} src={assetUrl(e.profileImage)} size={30} />
                        <Text title={`${e.firstName} ${e.lastName}`} sub={[e.employeeId, e.designation].filter(Boolean).join(" · ")} />
                        <User className="h-4 w-4 text-ink-subtle" aria-hidden />
                      </Row>
                    ))}
                  </Group>
                  <Group title="Projects" show={d.projects.length > 0}>
                    {d.projects.map((p) => (
                      <Row key={p.id} onClick={() => go("/management/projects")}>
                        <IconTile icon={FolderKanban} />
                        <Text title={p.name} sub={[p.projectId, p.client?.name].filter(Boolean).join(" · ")} />
                      </Row>
                    ))}
                  </Group>
                  <Group title="Jobs" show={d.jobs.length > 0}>
                    {d.jobs.map((j) => (
                      <Row key={j.id} onClick={() => go("/management/jobs")}>
                        <IconTile icon={Briefcase} />
                        <Text title={j.name} sub={[j.jobId, j.project?.name].filter(Boolean).join(" · ")} />
                      </Row>
                    ))}
                  </Group>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Group({ title, show, children }: { title: string; show: boolean; children: React.ReactNode }) {
  if (!show) return null;
  return (
    <div className="mb-1">
      <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">{title}</p>
      {children}
    </div>
  );
}
function Row({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-brand-softer")}>
      {children}
    </button>
  );
}
function Text({ title, sub }: { title: string; sub?: string }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium text-ink">{title}</span>
      {sub && <span className="block truncate text-xs text-ink-subtle">{sub}</span>}
    </span>
  );
}
function IconTile({ icon: Icon }: { icon: typeof Search }) {
  return (
    <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-brand-soft text-brand">
      <Icon className="h-4 w-4" aria-hidden />
    </span>
  );
}
