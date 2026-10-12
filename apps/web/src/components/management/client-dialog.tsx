"use client";

import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { Envelope } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormRow, Input, Select, Textarea } from "@/components/ui/inputs";
import { useToast } from "@/components/ui/toast";
import { clientBody, fullName, useMgmtMutations, type Client } from "./api";
import { COUNTRIES, GSTIN_RE, INDIAN_STATES, PAN_RE, PIN_RE } from "./geo";

export function ClientDialog({ open, onClose, client }: { open: boolean; onClose: () => void; client?: Client | null }) {
  if (!open) return null;
  return <ClientForm key={client?.id ?? "new"} onClose={onClose} client={client} />;
}

function ClientForm({ onClose, client }: { onClose: () => void; client?: Client | null }) {
  const toast = useToast();
  const { saveClient } = useMgmtMutations();
  const [f, setF] = useState({
    name: client?.name ?? "",
    alias: client?.alias ?? "",
    address: client?.address ?? "",
    country: client?.country ?? "India",
    state: client?.state ?? "",
    pin: client?.pin ?? "",
    gstStatus: client?.gstStatus === "Yes" ? "Yes" : "No",
    gstin: client?.gstin ?? "",
    pan: client?.pan ?? "",
    partnerId: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  const partners = useQuery({
    queryKey: ["lookup", "partners"],
    queryFn: async () => (await api<Envelope<{ id: string; firstName: string; lastName: string; employeeId: string }[]>>("employees/partners")).data ?? [],
    enabled: !client,
    staleTime: 5 * 60_000,
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const gstin = f.gstin.trim().toUpperCase();
    const pan = f.pan.trim().toUpperCase();
    const errs: Record<string, string> = {};
    if (f.name.trim().length < 2) errs.name = "Enter the client’s legal name.";
    if (!f.country) errs.country = "Choose a country.";
    if (f.gstStatus === "Yes" && !gstin) errs.gstin = "GSTIN is required for GST-registered clients.";
    else if (gstin && !GSTIN_RE.test(gstin)) errs.gstin = "That doesn’t look like a valid 15-character GSTIN.";
    if (pan && !PAN_RE.test(pan)) errs.pan = "PAN should look like ABCDE1234F.";
    if (f.pin.trim() && !PIN_RE.test(f.pin.trim())) errs.pin = "PIN code must be 6 digits.";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const body = {
      ...(client ? clientBody(client) : {}),
      name: f.name.trim(),
      alias: f.alias.trim(),
      address: f.address.trim() || null,
      country: f.country,
      state: f.country === "India" ? f.state || null : f.state.trim() || null,
      pin: f.pin.trim() || null,
      gstStatus: f.gstStatus,
      gstin: f.gstStatus === "Yes" ? gstin : null,
      pan,
      ...(client ? {} : { status: "Active", ...(f.partnerId ? { partnerId: f.partnerId } : {}) }),
    };
    try {
      await saveClient.mutateAsync({ id: client?.id, body });
      toast.success(client ? "Client updated" : "Client added", body.name);
      onClose();
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Couldn’t save the client.");
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={client ? `Edit ${client.name}` : "Add client"}
      description={client ? `${client.clientId} · client codes are assigned automatically` : "A client code (e.g. CL0012) is assigned automatically."}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saveClient.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="client-form" loading={saveClient.isPending}>
            {client ? "Save changes" : "Add client"}
          </Button>
        </>
      }
    >
      <form id="client-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Legal name" htmlFor="c-name" required error={errors.name} className="sm:col-span-2">
          <Input id="c-name" value={f.name} invalid={!!errors.name} onChange={(e) => set("name", e.target.value)} maxLength={150} />
        </FormRow>
        <FormRow label="Alias / short name" htmlFor="c-alias">
          <Input id="c-alias" value={f.alias} onChange={(e) => set("alias", e.target.value)} maxLength={60} />
        </FormRow>
        {!client ? (
          <FormRow label="Engagement partner" htmlFor="c-partner" hint="Leave empty to use your own partner.">
            <Select id="c-partner" value={f.partnerId} onChange={(e) => set("partnerId", e.target.value)}>
              <option value="">{partners.isLoading ? "Loading…" : "Default"}</option>
              {(partners.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {fullName(p)}
                </option>
              ))}
            </Select>
          </FormRow>
        ) : (
          <div />
        )}
        <FormRow label="Registered address" htmlFor="c-addr" className="sm:col-span-2">
          <Textarea id="c-addr" rows={2} value={f.address} onChange={(e) => set("address", e.target.value)} maxLength={400} />
        </FormRow>
        <FormRow label="Country" htmlFor="c-country" required error={errors.country}>
          <Select id="c-country" value={f.country} onChange={(e) => (set("country", e.target.value), set("state", ""))}>
            {[...new Set([...COUNTRIES, ...(f.country ? [f.country] : [])])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="State" htmlFor="c-state">
          {f.country === "India" ? (
            <Select id="c-state" value={f.state} onChange={(e) => set("state", e.target.value)}>
              <option value="">Select a state</option>
              {INDIAN_STATES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          ) : (
            <Input id="c-state" value={f.state} onChange={(e) => set("state", e.target.value)} />
          )}
        </FormRow>
        <FormRow label="PIN code" htmlFor="c-pin" error={errors.pin}>
          <Input id="c-pin" inputMode="numeric" maxLength={6} value={f.pin} invalid={!!errors.pin} onChange={(e) => set("pin", e.target.value.replace(/\D/g, ""))} />
        </FormRow>
        <FormRow label="PAN" htmlFor="c-pan" error={errors.pan}>
          <Input id="c-pan" maxLength={10} value={f.pan} invalid={!!errors.pan} onChange={(e) => set("pan", e.target.value.toUpperCase())} className="uppercase" />
        </FormRow>
        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-ink">GST registered?</span>
          <div role="radiogroup" aria-label="GST registered" className="grid h-10 grid-cols-2 gap-1 rounded-xl border border-line-strong bg-surface-muted p-1">
            {["Yes", "No"].map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={f.gstStatus === v}
                onClick={() => set("gstStatus", v)}
                className={cn("rounded-lg text-[13px] font-medium", f.gstStatus === v ? "bg-surface text-brand shadow-sm" : "text-ink-muted hover:text-ink")}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <FormRow label="GSTIN" htmlFor="c-gstin" required={f.gstStatus === "Yes"} error={errors.gstin}>
          <Input id="c-gstin" maxLength={15} disabled={f.gstStatus !== "Yes"} value={f.gstStatus === "Yes" ? f.gstin : ""} invalid={!!errors.gstin} onChange={(e) => set("gstin", e.target.value.toUpperCase())} className="uppercase" />
        </FormRow>
        {serverError && <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger sm:col-span-2">{serverError}</p>}
      </form>
    </Dialog>
  );
}
