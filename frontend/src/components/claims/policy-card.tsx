"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, ShieldCheck } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import type { Envelope } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { FormRow, Input, Textarea } from "@/components/ui/inputs";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { CATEGORIES } from "./api";

export interface ExpensePolicy {
  id: string;
  category: string;
  perClaimLimit: number | null;
  monthlyLimit: number | null;
  receiptRequiredAbove: number | null;
  submitWithinDays: number | null;
  isActive: boolean;
  notes: string | null;
}

export function useExpensePolicies() {
  return useQuery({
    queryKey: ["claims", "policies"],
    queryFn: async () => (await api<Envelope<ExpensePolicy[]>>("expense-policies")).data ?? [],
    staleTime: 5 * 60_000,
  });
}

/** One line describing a category's rules, or null when it has none. */
export function policyText(p?: ExpensePolicy | null) {
  if (!p || !p.isActive) return null;
  const parts = [
    p.perClaimLimit != null && `up to ${formatCurrency(p.perClaimLimit)} a claim`,
    p.monthlyLimit != null && `${formatCurrency(p.monthlyLimit)} a month`,
    p.receiptRequiredAbove != null && `bill needed above ${formatCurrency(p.receiptRequiredAbove)}`,
    p.submitWithinDays != null && `claim within ${p.submitWithinDays} days`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** Expense rules per category. Everyone can read them; HR / Finance / Admin can edit. */
export function PolicyCard({ canEdit }: { canEdit: boolean }) {
  const q = useExpensePolicies();
  const [editing, setEditing] = useState<string | null>(null);
  const byCat = (c: string) => (q.data ?? []).find((p) => p.category.toLowerCase() === c.toLowerCase());
  const categories = [...new Set([...CATEGORIES, ...(q.data ?? []).map((p) => p.category)])];
  const visible = canEdit ? categories : categories.filter((c) => policyText(byCat(c)));

  if (!canEdit && !q.isLoading && !visible.length) return null;
  return (
    <Card>
      <CardHeader icon={ShieldCheck} title="Expense policy" description={canEdit ? "Limits checked when a claim is filed or edited." : "Limits that apply to your claims."} />
      {q.isLoading ? (
        <div className="p-5">
          <Skeleton className="h-20" />
        </div>
      ) : q.isError ? (
        <ErrorState onRetry={() => void q.refetch()} />
      ) : (
        <ul className="divide-y divide-line px-5 pb-3">
          {visible.map((c) => {
            const text = policyText(byCat(c));
            return (
              <li key={c} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-ink">{c}</span>
                  <span className="block text-xs text-ink-muted">{text ?? "No limits"}</span>
                </span>
                {canEdit && (
                  <Button variant="ghost" size="sm" onClick={() => setEditing(c)} aria-label={`Edit ${c} policy`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {editing && <PolicyDialog category={editing} policy={byCat(editing)} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function PolicyDialog({ category, policy, onClose }: { category: string; policy?: ExpensePolicy; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const str = (n: number | null | undefined) => (n == null ? "" : String(n));
  const [f, setF] = useState({
    perClaimLimit: str(policy?.perClaimLimit),
    monthlyLimit: str(policy?.monthlyLimit),
    receiptRequiredAbove: str(policy?.receiptRequiredAbove),
    submitWithinDays: str(policy?.submitWithinDays),
    notes: policy?.notes ?? "",
  });
  const save = useMutation({
    mutationFn: () => api("expense-policies", { method: "PUT", body: { category, ...f, isActive: true } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["claims", "policies"] });
      toast.success(`${category} policy saved`);
      onClose();
    },
    onError: (e) => toast.error("Couldn’t save the policy", e instanceof ApiError ? e.message : undefined),
  });
  const field = (k: keyof typeof f, label: string, hint: string) => (
    <FormRow label={label} htmlFor={`pol-${k}`} hint={hint}>
      <Input id={`pol-${k}`} inputMode="decimal" value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} placeholder="No limit" />
    </FormRow>
  );
  return (
    <Dialog
      open
      onClose={onClose}
      title={`${category} expense policy`}
      description="Leave a box empty for no limit."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {field("perClaimLimit", "Limit per claim (₹)", "Largest single claim allowed.")}
        {field("monthlyLimit", "Monthly limit per person (₹)", "Total of a person’s claims in a month.")}
        {field("receiptRequiredAbove", "Bill required above (₹)", "Claims over this need an attached bill.")}
        {field("submitWithinDays", "Claim within (days)", "Days after the expense to file the claim.")}
        <FormRow label="Note for staff" htmlFor="pol-notes" className="sm:col-span-2">
          <Textarea id="pol-notes" rows={2} value={f.notes} onChange={(e) => setF((x) => ({ ...x, notes: e.target.value }))} maxLength={300} />
        </FormRow>
      </div>
    </Dialog>
  );
}
