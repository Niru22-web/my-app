"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { statusOf, useMyJobs, type Timelog } from "./api";

export type ApprovalStatus = "draft" | "submitted" | "approved" | "rejected";

export interface TimeFilters {
  clients: string[];
  projects: string[];
  jobs: string[];
  billable: "all" | "billable" | "non_billable";
  statuses: ApprovalStatus[];
}

export const NO_FILTERS: TimeFilters = { clients: [], projects: [], jobs: [], billable: "all", statuses: [] };

export function activeFilterCount(f: TimeFilters): number {
  return (f.clients.length ? 1 : 0) + (f.projects.length ? 1 : 0) + (f.jobs.length ? 1 : 0) + (f.billable !== "all" ? 1 : 0) + (f.statuses.length ? 1 : 0);
}

export function applyFilters(entries: Timelog[], f: TimeFilters): Timelog[] {
  return entries.filter((e) => {
    const clientId = e.job?.project?.client?.id ?? e.clientId ?? "";
    const projectId = e.job?.project?.id ?? e.projectId ?? "";
    if (f.clients.length && !f.clients.includes(clientId)) return false;
    if (f.projects.length && !f.projects.includes(projectId)) return false;
    if (f.jobs.length && !f.jobs.includes(e.jobId)) return false;
    if (f.billable !== "all" && (e.billableStatus === "non_billable" ? "non_billable" : "billable") !== f.billable) return false;
    if (f.statuses.length && !f.statuses.includes(statusOf(e))) return false;
    return true;
  });
}

interface Opt {
  id: string;
  label: string;
  sub?: string;
  parent?: string;
}

const STATUS_OPTIONS: { id: ApprovalStatus; label: string }[] = [
  { id: "draft", label: "Draft" },
  { id: "submitted", label: "Submitted" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Returned" },
];

/** Right-side filter panel: clients, projects, jobs (ones I have time on or can log to), billable and approval status. */
export function FilterDrawer({ open, value, entries, onApply, onClose }: { open: boolean; value: TimeFilters; entries: Timelog[]; onApply: (f: TimeFilters) => void; onClose: () => void }) {
  if (!open) return null;
  return <DrawerBody value={value} entries={entries} onApply={onApply} onClose={onClose} />;
}

function DrawerBody({ value, entries, onApply, onClose }: { value: TimeFilters; entries: Timelog[]; onApply: (f: TimeFilters) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<TimeFilters>(value);
  const panel = useRef<HTMLDivElement>(null);
  const myJobs = useMyJobs();

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("input, button:not([data-close])")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
      // Keep Tab inside the panel.
      if (e.key === "Tab" && panel.current) {
        const f = [...panel.current.querySelectorAll<HTMLElement>("button, input, [tabindex]:not([tabindex='-1'])")].filter((x) => !x.hasAttribute("disabled"));
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [onClose]);

  const { clients, projects, jobs } = useMemo(() => {
    const c = new Map<string, Opt>();
    const p = new Map<string, Opt>();
    const j = new Map<string, Opt>();
    for (const x of myJobs.data ?? []) {
      c.set(x.client.id, { id: x.client.id, label: x.client.name });
      p.set(x.project.id, { id: x.project.id, label: x.project.name, sub: x.client.name, parent: x.client.id });
      j.set(x.id, { id: x.id, label: x.name, sub: `${x.jobId} · ${x.project.name}`, parent: x.project.id });
    }
    for (const e of entries) {
      const pr = e.job?.project;
      const cl = pr?.client;
      if (cl && !c.has(cl.id)) c.set(cl.id, { id: cl.id, label: cl.name });
      if (pr && !p.has(pr.id)) p.set(pr.id, { id: pr.id, label: pr.name, sub: cl?.name, parent: cl?.id });
      if (e.job && !j.has(e.job.id)) j.set(e.job.id, { id: e.job.id, label: e.job.name, sub: `${e.job.jobId} · ${pr?.name ?? ""}`, parent: pr?.id });
    }
    const sort = (m: Map<string, Opt>) => [...m.values()].sort((a, b) => a.label.localeCompare(b.label));
    return { clients: sort(c), projects: sort(p), jobs: sort(j) };
  }, [myJobs.data, entries]);

  // Narrow projects and jobs to the chosen clients / projects.
  const projectOpts = draft.clients.length ? projects.filter((p) => p.parent && draft.clients.includes(p.parent)) : projects;
  const projectIds = new Set(projectOpts.map((p) => p.id));
  const jobOpts = draft.projects.length ? jobs.filter((j) => j.parent && draft.projects.includes(j.parent)) : jobs.filter((j) => !draft.clients.length || (j.parent && projectIds.has(j.parent)));

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/40" onMouseDown={onClose} aria-hidden />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="tl-filter-title" className="relative flex h-full w-full max-w-sm flex-col border-l border-line bg-surface shadow-pop">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 id="tl-filter-title" className="font-display text-base font-bold text-ink">
            Filter time logs
          </h2>
          <button data-close type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-muted" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <CheckList title="Clients" options={clients} value={draft.clients} onChange={(v) => setDraft((d) => ({ ...d, clients: v, projects: [], jobs: [] }))} />
          <CheckList title="Projects" options={projectOpts} value={draft.projects} onChange={(v) => setDraft((d) => ({ ...d, projects: v, jobs: [] }))} />
          <CheckList title="Jobs" options={jobOpts} value={draft.jobs} onChange={(v) => setDraft((d) => ({ ...d, jobs: v }))} loading={myJobs.isLoading} />
          <Group title="Billable status">
            <div role="radiogroup" aria-label="Billable status" className="grid grid-cols-3 gap-1 rounded-xl border border-line-strong bg-surface-muted p-1">
              {(
                [
                  ["all", "All"],
                  ["billable", "Billable"],
                  ["non_billable", "Non-billable"],
                ] as const
              ).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={draft.billable === v}
                  onClick={() => setDraft((d) => ({ ...d, billable: v }))}
                  className={cn("h-8 rounded-lg text-[13px] font-medium", draft.billable === v ? "bg-surface text-brand shadow-sm" : "text-ink-muted hover:text-ink")}
                >
                  {l}
                </button>
              ))}
            </div>
          </Group>
          <Group title="Approval status">
            <div className="grid grid-cols-2 gap-2">
              {STATUS_OPTIONS.map((s) => (
                <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-2.5 py-2 text-[13px] text-ink hover:bg-surface-muted">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--brand)]"
                    checked={draft.statuses.includes(s.id)}
                    onChange={(e) => setDraft((d) => ({ ...d, statuses: e.target.checked ? [...d.statuses, s.id] : d.statuses.filter((x) => x !== s.id) }))}
                  />
                  {s.label}
                </label>
              ))}
            </div>
          </Group>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <Button
            variant="secondary"
            onClick={() => {
              setDraft(NO_FILTERS);
              onApply(NO_FILTERS);
              onClose();
            }}
          >
            Reset
          </Button>
          <Button
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            Apply
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[13px] font-semibold text-ink">{title}</p>
      {children}
    </div>
  );
}

function CheckList({ title, options, value, onChange, loading }: { title: string; options: Opt[]; value: string[]; onChange: (v: string[]) => void; loading?: boolean }) {
  const [q, setQ] = useState("");
  const shown = q.trim() ? options.filter((o) => `${o.label} ${o.sub ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())) : options;
  return (
    <Group title={`${title}${value.length ? ` (${value.length})` : ""}`}>
      {options.length > 6 && (
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${title.toLowerCase()}…`}
            aria-label={`Search ${title.toLowerCase()}`}
            className="h-8 w-full rounded-lg border border-line bg-surface pl-8 pr-2 text-[13px] text-ink outline-none placeholder:text-ink-subtle focus:border-brand"
          />
        </div>
      )}
      <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-xl border border-line p-1">
        {loading && !options.length ? (
          <p className="px-2 py-2 text-xs text-ink-subtle">Loading…</p>
        ) : !shown.length ? (
          <p className="px-2 py-2 text-xs text-ink-subtle">Nothing to choose from.</p>
        ) : (
          shown.map((o) => (
            <label key={o.id} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-muted">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]"
                checked={value.includes(o.id)}
                onChange={(e) => onChange(e.target.checked ? [...value, o.id] : value.filter((x) => x !== o.id))}
              />
              <span className="min-w-0">
                <span className="block truncate text-[13px] text-ink">{o.label}</span>
                {o.sub && <span className="block truncate text-[11px] text-ink-subtle">{o.sub}</span>}
              </span>
            </label>
          ))
        )}
      </div>
    </Group>
  );
}
