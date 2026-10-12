"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import { today, workDate } from "@/lib/dates";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormRow, Input, Select, Textarea } from "@/components/ui/inputs";
import { PeoplePicker } from "@/components/ui/people-picker";
import { useToast } from "@/components/ui/toast";
import { usePeople } from "@/components/management/api";
import { useAssetMutations, useCategories, useLocations, useTypes, useVendors, type Asset, type AssetInput } from "./api";

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : undefined);

// ── Add / edit asset ─────────────────────────────────────────────────────────

export function AssetDialog({ asset, onClose }: { asset?: Asset | null; onClose: () => void }) {
  const toast = useToast();
  const m = useAssetMutations();
  const cats = useCategories();
  const types = useTypes();
  const locs = useLocations();
  const vendors = useVendors();
  const init = {
    assetName: asset?.assetName ?? "",
    serialNumber: asset?.serialNumber ?? "",
    officeTagNo: asset?.officeTagNo ?? "",
    category: asset?.category ?? "",
    type: asset?.type ?? "",
    purchaseDate: asset?.purchaseDate ? workDate(asset.purchaseDate) : "",
    purchaseCost: asset?.purchaseCost != null ? String(asset.purchaseCost) : "",
    warrantyExpiry: asset?.warrantyExpiry ? workDate(asset.warrantyExpiry) : "",
    vendorId: asset?.vendorId ?? "",
    location: asset?.location ?? "",
    condition: asset?.condition ?? "New",
    description: asset?.description ?? "",
  };
  const [f, setF] = useState(init);
  const [tried, setTried] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  const catId = cats.data?.find((c) => c.name === f.category)?.id;
  const typeOptions = useMemo(() => (types.data ?? []).filter((t) => !catId || t.assetCategoryId === catId), [types.data, catId]);
  const cost = f.purchaseCost === "" ? undefined : Number(f.purchaseCost);
  const errors = {
    assetName: !f.assetName.trim() ? "Name the asset." : "",
    serialNumber: !f.serialNumber.trim() ? "The serial number is required and must be unique." : "",
    category: !f.category.trim() ? "Choose a category." : "",
    type: !f.type.trim() ? "Choose a type." : "",
    purchaseCost: cost != null && (Number.isNaN(cost) || cost < 0) ? "Enter a valid amount." : "",
    warrantyExpiry: f.warrantyExpiry && f.purchaseDate && f.warrantyExpiry < f.purchaseDate ? "Warranty can’t end before purchase." : "",
  };
  const invalid = Object.values(errors).some(Boolean);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (invalid) return;
    // Only send what changed on edit — the API clears dates/cost/vendor when it receives "".
    const full: AssetInput = {
      assetName: f.assetName.trim(),
      serialNumber: f.serialNumber.trim(),
      category: f.category.trim(),
      type: f.type.trim(),
      officeTagNo: f.officeTagNo.trim() || undefined,
      purchaseDate: f.purchaseDate || undefined,
      purchaseCost: cost,
      warrantyExpiry: f.warrantyExpiry || undefined,
      vendorId: f.vendorId || undefined,
      location: f.location || undefined,
      condition: f.condition,
      description: f.description.trim() || undefined,
    };
    try {
      if (asset) {
        const body: Record<string, unknown> = {};
        (Object.keys(init) as (keyof typeof init)[]).forEach((k) => {
          if (f[k] === init[k]) return;
          body[k] = k === "purchaseCost" ? (f[k] === "" ? "" : cost) : typeof f[k] === "string" ? f[k].trim() : f[k];
        });
        if (!Object.keys(body).length) return onClose();
        await m.update.mutateAsync({ id: asset.id, body: body as Partial<AssetInput> });
        toast.success("Asset updated");
      } else {
        await m.create.mutateAsync(full);
        toast.success("Asset added", `${full.assetName} is now available to assign.`);
      }
      onClose();
    } catch (err) {
      toast.error(asset ? "Couldn’t save changes" : "Couldn’t add the asset", errMsg(err));
    }
  }

  const noMasters = !cats.isLoading && !(cats.data?.length && types.data?.length);

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={asset ? `Edit ${asset.assetName}` : "Add an asset"}
      description={asset ? `${asset.assetId ?? asset.serialNumber} · status is changed with the actions in the list, not here.` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="asset-form" loading={m.create.isPending || m.update.isPending}>
            {asset ? "Save changes" : "Add asset"}
          </Button>
        </>
      }
    >
      <form id="asset-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        {noMasters && (
          <p className="rounded-xl bg-warning/10 px-3.5 py-2.5 text-[13px] text-ink sm:col-span-2">
            No categories or types are set up yet — type them in, or add them under <strong>Setup</strong> first so everyone uses the same names.
          </p>
        )}
        <FormRow label="Asset name" htmlFor="as-name" required error={tried ? errors.assetName : undefined} className="sm:col-span-2">
          <Input id="as-name" value={f.assetName} onChange={set("assetName")} placeholder="e.g. Dell Latitude 5440" invalid={tried && !!errors.assetName} />
        </FormRow>
        <FormRow label="Serial number" htmlFor="as-serial" required error={tried ? errors.serialNumber : undefined}>
          <Input id="as-serial" value={f.serialNumber} onChange={set("serialNumber")} invalid={tried && !!errors.serialNumber} />
        </FormRow>
        <FormRow label="Office tag" htmlFor="as-tag" hint="Optional — used as the asset ID">
          <Input id="as-tag" value={f.officeTagNo} onChange={set("officeTagNo")} disabled={!!asset?.assetId} />
        </FormRow>
        <FormRow label="Category" htmlFor="as-cat" required error={tried ? errors.category : undefined}>
          {cats.data?.length ? (
            <Select id="as-cat" value={f.category} onChange={(e) => setF((p) => ({ ...p, category: e.target.value, type: "" }))} invalid={tried && !!errors.category}>
              <option value="">Choose…</option>
              {f.category && !cats.data.some((c) => c.name === f.category) && <option>{f.category}</option>}
              {cats.data.map((c) => (
                <option key={c.id}>{c.name}</option>
              ))}
            </Select>
          ) : (
            <Input id="as-cat" value={f.category} onChange={set("category")} invalid={tried && !!errors.category} />
          )}
        </FormRow>
        <FormRow label="Type" htmlFor="as-type" required error={tried ? errors.type : undefined}>
          {typeOptions.length ? (
            <Select id="as-type" value={f.type} onChange={set("type")} invalid={tried && !!errors.type}>
              <option value="">Choose…</option>
              {f.type && !typeOptions.some((t) => t.name === f.type) && <option>{f.type}</option>}
              {typeOptions.map((t) => (
                <option key={t.id}>{t.name}</option>
              ))}
            </Select>
          ) : (
            <Input id="as-type" value={f.type} onChange={set("type")} invalid={tried && !!errors.type} />
          )}
        </FormRow>
        <FormRow label="Purchase date" htmlFor="as-pdate" hint="Optional">
          <Input id="as-pdate" type="date" max={today()} value={f.purchaseDate} onChange={set("purchaseDate")} />
        </FormRow>
        <FormRow label="Purchase cost (₹)" htmlFor="as-cost" hint="Optional" error={tried ? errors.purchaseCost : undefined}>
          <Input id="as-cost" type="number" min={0} step="0.01" value={f.purchaseCost} onChange={set("purchaseCost")} invalid={tried && !!errors.purchaseCost} />
        </FormRow>
        <FormRow label="Warranty until" htmlFor="as-warranty" hint="Optional" error={tried ? errors.warrantyExpiry : undefined}>
          <Input id="as-warranty" type="date" value={f.warrantyExpiry} onChange={set("warrantyExpiry")} invalid={tried && !!errors.warrantyExpiry} />
        </FormRow>
        <FormRow label="Vendor" htmlFor="as-vendor" hint="Optional">
          <Select id="as-vendor" value={f.vendorId} onChange={set("vendorId")}>
            <option value="">—</option>
            {(vendors.data ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.vendorName}
                {v.company && v.company !== v.vendorName ? ` (${v.company})` : ""}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Location" htmlFor="as-loc" hint="Optional">
          {locs.data?.length ? (
            <Select id="as-loc" value={f.location} onChange={set("location")}>
              <option value="">—</option>
              {f.location && !locs.data.some((l) => l.name === f.location) && <option>{f.location}</option>}
              {locs.data.map((l) => (
                <option key={l.id}>{l.name}</option>
              ))}
            </Select>
          ) : (
            <Input id="as-loc" value={f.location} onChange={set("location")} />
          )}
        </FormRow>
        <FormRow label="Condition" htmlFor="as-cond">
          <Select id="as-cond" value={f.condition} onChange={set("condition")}>
            {["New", "Good", "Fair", "Damaged"].map((c) => (
              <option key={c}>{c}</option>
            ))}
            {!["New", "Good", "Fair", "Damaged"].includes(f.condition) && <option>{f.condition}</option>}
          </Select>
        </FormRow>
        <FormRow label="Notes" htmlFor="as-desc" hint="Optional — specs, accessories, licence keys go elsewhere" className="sm:col-span-2">
          <Textarea id="as-desc" rows={2} value={f.description} onChange={set("description")} />
        </FormRow>
      </form>
    </Dialog>
  );
}

// ── Assign / transfer to a person ────────────────────────────────────────────

export function AssignDialog({
  title,
  description,
  confirmLabel,
  excludeId,
  onClose,
  onConfirm,
  busy,
}: {
  title: string;
  description?: string;
  confirmLabel: string;
  excludeId?: string;
  onClose: () => void;
  onConfirm: (employeeId: string, remarks: string) => void;
  busy: boolean;
}) {
  const people = usePeople();
  const [who, setWho] = useState<string[]>([]);
  const [remarks, setRemarks] = useState("");
  const options = useMemo(
    () =>
      (people.data ?? [])
        .filter((p) => (p.status ?? "active").toLowerCase() === "active" && p.id !== excludeId)
        .map((p) => ({ id: p.id, label: `${p.firstName} ${p.lastName ?? ""}`.trim(), sub: [p.employeeId, p.department].filter(Boolean).join(" · ") })),
    [people.data, excludeId],
  );
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!who.length} loading={busy} onClick={() => onConfirm(who[0], remarks.trim())}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormRow label="Person" htmlFor="as-who" required>
          <PeoplePicker id="as-who" options={options} value={who} onChange={(ids) => setWho(ids.slice(-1))} placeholder="Search by name or code" loading={people.isLoading} />
        </FormRow>
        <FormRow label="Remarks" htmlFor="as-remarks" hint="Optional — e.g. charger and bag included">
          <Textarea id="as-remarks" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </FormRow>
      </div>
    </Dialog>
  );
}

// ── Return ───────────────────────────────────────────────────────────────────

export function ReturnDialog({ name, onClose, onConfirm, busy }: { name: string; onClose: () => void; onConfirm: (condition: string, remarks: string) => void; busy: boolean }) {
  const [condition, setCondition] = useState("Good");
  const [remarks, setRemarks] = useState("");
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Take back ${name}`}
      description="The asset becomes available to assign again."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => onConfirm(condition, remarks.trim())}>
            Mark returned
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormRow label="Condition on return" htmlFor="rt-cond">
          <Select id="rt-cond" value={condition} onChange={(e) => setCondition(e.target.value)}>
            {["Good", "Fair", "Damaged"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Remarks" htmlFor="rt-remarks" hint="Optional">
          <Textarea id="rt-remarks" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </FormRow>
      </div>
    </Dialog>
  );
}

// ── Log maintenance ──────────────────────────────────────────────────────────

export function MaintenanceDialog({ asset, assets, onClose }: { asset?: Asset | null; assets: Asset[]; onClose: () => void }) {
  const toast = useToast();
  const m = useAssetMutations();
  const eligible = assets.filter((a) => !["Maintenance", "Retired", "Lost"].includes(a.status));
  const [inventoryId, setInventoryId] = useState(asset?.id ?? "");
  const [type, setType] = useState("Repair");
  const [date, setDate] = useState(today());
  const [cost, setCost] = useState("");
  const [description, setDescription] = useState("");
  const c = cost === "" ? undefined : Number(cost);
  const bad = !inventoryId || !date || (c != null && (Number.isNaN(c) || c < 0));

  async function save() {
    try {
      await m.logMaintenance.mutateAsync({ inventoryId, type, date, cost: c, description: description.trim() || undefined });
      toast.success("Maintenance logged", "The asset is marked as in maintenance until you complete it.");
      onClose();
    } catch (err) {
      toast.error("Couldn’t log maintenance", errMsg(err));
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Log maintenance"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={bad} loading={m.logMaintenance.isPending} onClick={save}>
            Log maintenance
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Asset" htmlFor="mt-asset" required className="sm:col-span-2">
          <Select id="mt-asset" value={inventoryId} onChange={(e) => setInventoryId(e.target.value)} disabled={!!asset}>
            <option value="">Choose…</option>
            {(asset ? [asset] : eligible).map((a) => (
              <option key={a.id} value={a.id}>
                {a.assetName} · {a.serialNumber}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Type" htmlFor="mt-type">
          <Select id="mt-type" value={type} onChange={(e) => setType(e.target.value)}>
            {["Repair", "Servicing", "Upgrade", "Inspection"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Date" htmlFor="mt-date" required>
          <Input id="mt-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </FormRow>
        <FormRow label="Cost (₹)" htmlFor="mt-cost" hint="Optional">
          <Input id="mt-cost" type="number" min={0} step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
        </FormRow>
        <FormRow label="What’s being done" htmlFor="mt-desc" hint="Optional" className="sm:col-span-2">
          <Textarea id="mt-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </FormRow>
      </div>
    </Dialog>
  );
}
