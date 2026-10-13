"use client";

import { useState, type FormEvent } from "react";
import { Coins, Globe, Plus, Trash2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import { today } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { FormRow, Input, Select } from "@/components/ui/inputs";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { useAccountsMutations, useCurrencies, type CurrencyItem, type ExchangeRateItem } from "@/components/accounts/api";

export default function CurrenciesPage() {
  const q = useCurrencies();
  const m = useAccountsMutations();
  const toast = useToast();

  const [addCurOpen, setAddCurOpen] = useState(false);
  const [rateFor, setRateFor] = useState<string | null>(null);
  const [deletingRate, setDeletingRate] = useState<(ExchangeRateItem & { code: string }) | null>(null);

  if (q.isError) {
    return (
      <Card>
        <ErrorState message="Currencies couldn’t be loaded." onRetry={() => q.refetch()} />
      </Card>
    );
  }

  const currencies = q.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Currencies & exchange rates"
        description="Foreign currencies used on export invoices and their conversion rates to ₹ (INR)"
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setAddCurOpen(true)}>
              <Plus className="h-4 w-4" /> Add currency
            </Button>
            {currencies.some((c) => c.code !== "INR") && (
              <Button onClick={() => setRateFor(currencies.find((c) => c.code !== "INR")?.code ?? "")}>
                <Coins className="h-4 w-4" /> Record rate
              </Button>
            )}
          </div>
        }
      />

      {q.isLoading ? (
        <Skeleton className="h-48" />
      ) : !currencies.length ? (
        <Card>
          <EmptyState
            icon={Globe}
            title="No currencies configured yet"
            description="Add INR and any foreign currencies you bill in (such as USD, AED, EUR, or GBP)."
            action={<Button onClick={() => setAddCurOpen(true)}>Add currency</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {currencies.map((c) => {
            const rates = [...(c.exchangeRates ?? [])].sort((a, b) => b.date.localeCompare(a.date));
            const latest = rates[0];
            return (
              <Card key={c.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-base font-bold text-ink">{c.code}</span>
                      {c.symbol && <Badge>{c.symbol}</Badge>}
                      {c.code === "INR" && <Badge tone="brand">Base currency</Badge>}
                    </div>
                    <p className="mt-0.5 text-[13px] text-ink-muted">{c.name}</p>
                  </div>
                  {c.code !== "INR" && (
                    <Button variant="secondary" size="sm" onClick={() => setRateFor(c.code)}>
                      <Plus className="h-3.5 w-3.5" /> New rate
                    </Button>
                  )}
                </div>

                {c.code === "INR" ? (
                  <p className="mt-4 text-xs text-ink-subtle">All portal reports and ledgers convert foreign documents into ₹ (INR) at their recorded exchange rate.</p>
                ) : !rates.length ? (
                  <p className="mt-4 text-xs text-ink-subtle">No exchange rate recorded yet.</p>
                ) : (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-baseline justify-between rounded-xl bg-surface-muted px-3.5 py-2 text-[13px]">
                      <span className="text-ink-subtle">Latest rate ({formatDate(latest.date)})</span>
                      <span className="font-semibold tabular text-ink">
                        1 {c.code} = ₹{latest.rate}
                      </span>
                    </div>
                    <ul className="divide-y divide-line text-xs">
                      {rates.slice(0, 6).map((r) => (
                        <li key={r.id} className="flex items-center justify-between py-1.5">
                          <span className="text-ink-muted">{formatDate(r.date)}</span>
                          <span className="flex items-center gap-2">
                            <span className="font-medium tabular text-ink">₹{r.rate}</span>
                            <button
                              type="button"
                              onClick={() => setDeletingRate({ ...r, code: c.code })}
                              className="rounded p-1 text-ink-subtle hover:bg-surface-muted hover:text-danger"
                              aria-label="Delete exchange rate"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {addCurOpen && <AddCurrencyDialog onClose={() => setAddCurOpen(false)} />}
      {rateFor !== null && <AddRateDialog currencies={currencies.filter((c) => c.code !== "INR")} initialCode={rateFor} onClose={() => setRateFor(null)} />}
      <ConfirmDialog
        open={!!deletingRate}
        onClose={() => setDeletingRate(null)}
        tone="danger"
        title="Delete exchange rate?"
        description={deletingRate ? `Remove 1 ${deletingRate.code} = ₹${deletingRate.rate} (${formatDate(deletingRate.date)})?` : ""}
        confirmLabel="Delete"
        busy={m.deleteExchangeRate.isPending}
        onConfirm={() =>
          deletingRate &&
          m.deleteExchangeRate.mutate(deletingRate.id, {
            onSuccess: () => (toast.success("Exchange rate deleted"), setDeletingRate(null)),
            onError: (e) => (toast.error("Couldn’t delete", e instanceof ApiError ? e.message : undefined), setDeletingRate(null)),
          })
        }
      />
    </div>
  );
}

function AddCurrencyDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const m = useAccountsMutations();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const cleanCode = code.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(cleanCode) || !name.trim()) return;
    try {
      await m.createCurrency.mutateAsync({ code: cleanCode, name: name.trim(), symbol: symbol.trim() || cleanCode });
      toast.success(`Currency ${cleanCode} saved`);
      onClose();
    } catch (err) {
      toast.error("Couldn’t save currency", err instanceof ApiError ? err.message : undefined);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add currency"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="cur-form" disabled={!/^[A-Za-z]{3}$/.test(code.trim()) || !name.trim()} loading={m.createCurrency.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form id="cur-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
        <FormRow label="ISO code" htmlFor="cu-code" required hint="3 letters, e.g. USD">
          <Input id="cu-code" maxLength={3} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="font-mono uppercase" placeholder="USD" />
        </FormRow>
        <FormRow label="Symbol" htmlFor="cu-sym" hint="e.g. $, €, AED">
          <Input id="cu-sym" maxLength={5} value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="$" />
        </FormRow>
        <FormRow label="Currency name" htmlFor="cu-name" required className="sm:col-span-3">
          <Input id="cu-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="US Dollar" />
        </FormRow>
      </form>
    </Dialog>
  );
}

function AddRateDialog({ currencies, initialCode, onClose }: { currencies: CurrencyItem[]; initialCode: string; onClose: () => void }) {
  const toast = useToast();
  const m = useAccountsMutations();
  const [currencyCode, setCode] = useState(initialCode || currencies[0]?.code || "");
  const [rate, setRate] = useState("");
  const [date, setDate] = useState(today());

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = Number(rate);
    if (!currencyCode || !Number.isFinite(r) || r <= 0 || !date) return;
    try {
      await m.createExchangeRate.mutateAsync({ currencyCode, baseCurrency: "INR", rate: r, date });
      toast.success(`Recorded 1 ${currencyCode} = ₹${r}`);
      onClose();
    } catch (err) {
      toast.error("Couldn’t save exchange rate", err instanceof ApiError ? err.message : undefined);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Record exchange rate"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="rate-form" disabled={!currencyCode || !(Number(rate) > 0)} loading={m.createExchangeRate.isPending}>
            Save rate
          </Button>
        </>
      }
    >
      <form id="rate-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
        <FormRow label="Currency" htmlFor="rt-cur" required>
          <Select id="rt-cur" value={currencyCode} onChange={(e) => setCode(e.target.value)}>
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} · {c.name}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Value in ₹ (INR)" htmlFor="rt-val" required>
          <Input id="rt-val" type="number" min="0.0001" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="84.50" />
        </FormRow>
        <FormRow label="Effective date" htmlFor="rt-date" required>
          <Input id="rt-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </FormRow>
      </form>
    </Dialog>
  );
}
