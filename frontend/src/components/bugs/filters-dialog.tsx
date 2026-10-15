"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormRow, Input, Select } from "@/components/ui/inputs";
import { BUG_ENVIRONMENTS, BUG_MODULES, BUG_PRIORITIES, BUG_TYPES, type BugPerson } from "./api";

export interface BugFilters {
  type: string;
  priority: string;
  module: string;
  environment: string;
  assignee: string;
  from: string;
  to: string;
}
export const NO_FILTERS: BugFilters = { type: "", priority: "", module: "", environment: "", assignee: "", from: "", to: "" };
export const activeFilterCount = (f: BugFilters) => Object.values(f).filter(Boolean).length;

export function FiltersDialog({ open, value, people, onClose, onApply }: { open: boolean; value: BugFilters; people: BugPerson[]; onClose: () => void; onApply: (f: BugFilters) => void }) {
  if (!open) return null;
  return <FiltersForm value={value} people={people} onClose={onClose} onApply={onApply} />;
}

function FiltersForm({ value, people, onClose, onApply }: { value: BugFilters; people: BugPerson[]; onClose: () => void; onApply: (f: BugFilters) => void }) {
  const [f, setF] = useState(value);
  const set = (k: keyof BugFilters) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const badRange = !!f.from && !!f.to && f.from > f.to;
  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      title="Filter tickets"
      footer={
        <>
          <Button variant="ghost" onClick={() => setF(NO_FILTERS)}>
            Clear all
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={badRange} onClick={() => (onApply(f), onClose())}>
            Apply filters
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Type" htmlFor="bf-type">
          <Select id="bf-type" value={f.type} onChange={(e) => set("type")(e.target.value)}>
            <option value="">Any type</option>
            {BUG_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Priority" htmlFor="bf-priority">
          <Select id="bf-priority" value={f.priority} onChange={(e) => set("priority")(e.target.value)}>
            <option value="">Any priority</option>
            {BUG_PRIORITIES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Module" htmlFor="bf-module">
          <Select id="bf-module" value={f.module} onChange={(e) => set("module")(e.target.value)}>
            <option value="">Any module</option>
            {BUG_MODULES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Environment" htmlFor="bf-env">
          <Select id="bf-env" value={f.environment} onChange={(e) => set("environment")(e.target.value)}>
            <option value="">UAT and Live</option>
            {BUG_ENVIRONMENTS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Assigned to" htmlFor="bf-assignee" className="sm:col-span-2">
          <Select id="bf-assignee" value={f.assignee} onChange={(e) => set("assignee")(e.target.value)}>
            <option value="">Anyone</option>
            <option value="me">Me</option>
            <option value="none">Nobody (unassigned)</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Reported from" htmlFor="bf-from">
          <Input id="bf-from" type="date" value={f.from} onChange={(e) => set("from")(e.target.value)} />
        </FormRow>
        <FormRow label="Reported to" htmlFor="bf-to" error={badRange ? "The end date is before the start date." : undefined}>
          <Input id="bf-to" type="date" value={f.to} onChange={(e) => set("to")(e.target.value)} invalid={badRange} />
        </FormRow>
      </div>
    </Dialog>
  );
}
