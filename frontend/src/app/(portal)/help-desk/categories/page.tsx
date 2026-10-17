"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, FolderTree, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm";
import { FormRow, Input, Select, Textarea } from "@/components/ui/inputs";
import { useToast } from "@/components/ui/toast";
import { RowMenu } from "@/components/management/row-menu";
import { fullName, usePeople } from "@/components/management/api";
import { isCategoryAdmin, TEAMS, useCategoryMutations, useCategoryTree, type Category } from "@/components/helpdesk/api";

export default function CategoriesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const allowed = isCategoryAdmin(user?.role);
  const q = useCategoryTree(false);
  const m = useCategoryMutations();
  const people = usePeople(allowed);
  const [editor, setEditor] = useState<{ category?: Category; parent?: Category } | null>(null);
  const [del, setDel] = useState<Category | null>(null);
  const [open, setOpen] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!allowed) router.replace("/help-desk");
  }, [allowed, router]);
  if (!allowed) return null;

  const owner = (id: string | null) => (id ? (people.data?.find((p) => p.id === id) ? fullName(people.data.find((p) => p.id === id)) : "Assigned user") : null);
  const toggle = (c: Category) =>
    m.save.mutate(
      { id: c.id, body: { isActive: !c.isActive } },
      { onSuccess: () => toast.success(c.isActive ? "Category hidden from new tickets" : "Category re-enabled", c.categoryName), onError: (e) => toast.error("Couldn’t update", e instanceof ApiError ? e.message : undefined) },
    );

  const Row = ({ c, parent }: { c: Category; parent?: Category }) => {
    const kids = c.children ?? [];
    const expanded = open.has(c.id);
    return (
      <>
        <li className={cn("flex items-center gap-3 px-4 py-3", parent && "bg-surface-muted/60 pl-12")}>
          {!parent && kids.length > 0 ? (
            <button
              onClick={() => setOpen((s) => (s.has(c.id) ? new Set([...s].filter((x) => x !== c.id)) : new Set([...s, c.id])))}
              className="grid h-7 w-7 place-items-center rounded-lg text-ink-muted hover:bg-surface-muted"
              aria-label={expanded ? `Collapse ${c.categoryName}` : `Expand ${c.categoryName}`}
              aria-expanded={expanded}
            >
              <ChevronRight className={cn("h-4 w-4 transition-transform", expanded && "rotate-90")} />
            </button>
          ) : (
            !parent && <span className="w-7" />
          )}
          <div className="min-w-0 flex-1">
            <p className={cn("truncate text-sm font-medium", c.isActive ? "text-ink" : "text-ink-subtle line-through")}>{c.categoryName}</p>
            <p className="truncate text-xs text-ink-subtle">
              {[c.assignedTeam && `${c.assignedTeam} team`, `${c.slaHours ?? 24} h response`, owner(c.autoAssignUserId) && `auto-assigns to ${owner(c.autoAssignUserId)}`, c.supportEmail].filter(Boolean).join(" · ")}
            </p>
          </div>
          {!parent && <span className="hidden text-xs text-ink-subtle sm:inline">{kids.length} issue type{kids.length === 1 ? "" : "s"}</span>}
          {!c.isActive && <Badge tone="neutral">Hidden</Badge>}
          <RowMenu
            items={[
              ...(!parent ? [{ label: "Add issue type", icon: <Plus className="h-4 w-4" />, onClick: () => setEditor({ parent: c }) }] : []),
              { label: "Edit", icon: <Pencil className="h-4 w-4" />, onClick: () => setEditor({ category: c, parent }) },
              { label: c.isActive ? "Hide from new tickets" : "Show again", icon: <Power className="h-4 w-4" />, onClick: () => toggle(c) },
              { label: "Delete", icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => setDel(c) },
            ]}
          />
        </li>
        {expanded && kids.map((k) => <Row key={k.id} c={k} parent={c} />)}
      </>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categories & routing"
        description="What people can raise tickets about, which team handles each, and the response target."
        actions={
          <Button onClick={() => setEditor({})}>
            <Plus className="h-4 w-4" /> Add category
          </Button>
        }
      />
      <Card className="overflow-hidden">
        {q.isLoading ? (
          <div className="space-y-2 p-5">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : (q.data?.length ?? 0) === 0 ? (
          <EmptyState icon={FolderTree} title="No ticket categories yet" description="Add categories such as IT, HR or Finance so people can raise tickets." />
        ) : (
          <ul className="divide-y divide-line">
            {q.data!.map((c) => (
              <Row key={c.id} c={c} />
            ))}
          </ul>
        )}
      </Card>

      {editor && <CategoryForm category={editor.category} parent={editor.parent} people={(people.data ?? []).filter((p) => (p.status ?? "").toLowerCase() === "active").map((p) => ({ id: p.id, name: fullName(p) }))} onClose={() => setEditor(null)} />}

      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        tone="danger"
        title={`Delete ${del?.categoryName}?`}
        confirmLabel="Delete"
        busy={m.remove.isPending}
        description={`${(del?.children?.length ?? 0) > 0 ? `Its ${del!.children!.length} issue type(s) are deleted too. ` : ""}Existing tickets keep their text but lose the link to this category. Consider “Hide from new tickets” instead.`}
        onConfirm={() =>
          del &&
          m.remove.mutate(del.id, {
            onSuccess: () => (toast.success("Category deleted", del.categoryName), setDel(null)),
            onError: (e) => toast.error("Couldn’t delete", e instanceof ApiError ? e.message : undefined),
          })
        }
      />
    </div>
  );
}

function CategoryForm({ category, parent, people, onClose }: { category?: Category; parent?: Category; people: { id: string; name: string }[]; onClose: () => void }) {
  const toast = useToast();
  const { save } = useCategoryMutations();
  const sub = !!parent;
  const [f, setF] = useState({
    categoryName: category?.categoryName ?? "",
    description: category?.description ?? "",
    assignedTeam: category?.assignedTeam ?? parent?.assignedTeam ?? "IT",
    slaHours: String(category?.slaHours ?? parent?.slaHours ?? 24),
    displayOrder: String(category?.displayOrder ?? 1),
    supportEmail: category?.supportEmail ?? "",
    ccEmail: category?.ccEmail ?? "",
    escalationEmail: category?.escalationEmail ?? "",
    autoAssignUserId: category?.autoAssignUserId ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const emailOk = (v: string) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const errs: Record<string, string> = {};
    if (f.categoryName.trim().length < 2) errs.categoryName = "Enter a name.";
    const sla = Number(f.slaHours);
    if (!Number.isInteger(sla) || sla < 1 || sla > 720) errs.slaHours = "Use whole hours between 1 and 720.";
    for (const k of ["supportEmail", "ccEmail", "escalationEmail"] as const) if (!emailOk(f[k].trim())) errs[k] = "Enter a valid email address.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    // For issue types, empty contact fields inherit from the category.
    const opt = (v: string) => v.trim() || null;
    const body = {
      categoryName: f.categoryName.trim(),
      description: f.description.trim() || null,
      parentId: parent?.id ?? null,
      displayOrder: Number(f.displayOrder) || 1,
      assignedTeam: f.assignedTeam,
      slaHours: sla,
      supportEmail: opt(f.supportEmail),
      ccEmail: opt(f.ccEmail),
      escalationEmail: opt(f.escalationEmail),
      autoAssignUserId: f.autoAssignUserId || null,
      ...(category ? {} : { isActive: true }),
    };
    try {
      await save.mutateAsync({ id: category?.id, body });
      toast.success(category ? "Saved" : sub ? "Issue type added" : "Category added", body.categoryName);
      onClose();
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Couldn’t save.");
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={category ? `Edit ${category.categoryName}` : sub ? `New issue type under ${parent!.categoryName}` : "New category"}
      description={sub ? "Leave contact fields empty to use the category’s settings." : "Issue types under this category inherit empty contact fields from here."}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="cat-form" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form id="cat-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Name" htmlFor="cf-name" required error={errors.categoryName} className="sm:col-span-2">
          <Input id="cf-name" maxLength={80} value={f.categoryName} invalid={!!errors.categoryName} onChange={(e) => set("categoryName", e.target.value)} />
        </FormRow>
        <FormRow label="Description" htmlFor="cf-desc" className="sm:col-span-2">
          <Textarea id="cf-desc" rows={2} maxLength={300} value={f.description} onChange={(e) => set("description", e.target.value)} />
        </FormRow>
        <FormRow label="Handled by" htmlFor="cf-team" required>
          <Select id="cf-team" value={f.assignedTeam} onChange={(e) => set("assignedTeam", e.target.value)}>
            {[...new Set([...TEAMS, f.assignedTeam])].map((t) => (
              <option key={t} value={t}>
                {t} team
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Response target (hours)" htmlFor="cf-sla" required error={errors.slaHours}>
          <Input id="cf-sla" inputMode="numeric" value={f.slaHours} invalid={!!errors.slaHours} onChange={(e) => set("slaHours", e.target.value.replace(/\D/g, ""))} />
        </FormRow>
        <FormRow label="Auto-assign to" htmlFor="cf-owner" hint="Otherwise the least-busy person in the team gets it.">
          <Select id="cf-owner" value={f.autoAssignUserId} onChange={(e) => set("autoAssignUserId", e.target.value)}>
            <option value="">{sub ? "Same as category" : "Least-busy team member"}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Display order" htmlFor="cf-order">
          <Input id="cf-order" inputMode="numeric" value={f.displayOrder} onChange={(e) => set("displayOrder", e.target.value.replace(/\D/g, ""))} />
        </FormRow>
        <FormRow label="Team inbox (new-ticket emails)" htmlFor="cf-support" error={errors.supportEmail}>
          <Input id="cf-support" type="email" value={f.supportEmail} invalid={!!errors.supportEmail} onChange={(e) => set("supportEmail", e.target.value)} placeholder={sub ? "Same as category" : "e.g. it-support@…"} />
        </FormRow>
        <FormRow label="CC (team lead)" htmlFor="cf-cc" error={errors.ccEmail}>
          <Input id="cf-cc" type="email" value={f.ccEmail} invalid={!!errors.ccEmail} onChange={(e) => set("ccEmail", e.target.value)} placeholder={sub ? "Same as category" : undefined} />
        </FormRow>
        <FormRow label="Escalation contact" htmlFor="cf-esc" error={errors.escalationEmail} hint="Stored for when escalation emails are enabled on the server." className="sm:col-span-2">
          <Input id="cf-esc" type="email" value={f.escalationEmail} invalid={!!errors.escalationEmail} onChange={(e) => set("escalationEmail", e.target.value)} placeholder={sub ? "Same as category" : undefined} />
        </FormRow>
        {serverError && <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger sm:col-span-2">{serverError}</p>}
      </form>
    </Dialog>
  );
}
