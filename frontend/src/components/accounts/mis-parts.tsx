"use client";

import { useEffect, useMemo } from "react";
import { Select } from "@/components/ui/inputs";
import { Button } from "@/components/ui/button";
import { fyOf, monthName } from "./mis-api";

/** Months between from and to (inclusive), limited to the ones that have data. */
export function monthsBetween(all: string[], from: string, to: string) {
  const [a, b] = from <= to ? [from, to] : [to, from];
  return all.filter((m) => m >= a && m <= b);
}

/**
 * From/To month picker over the months that have data, with "Latest" and "This FY" shortcuts.
 * Starts on the latest month once data arrives.
 */
export function MonthRange({ months, from, to, onChange }: { months: string[]; from: string; to: string; onChange: (from: string, to: string) => void }) {
  const latest = months[months.length - 1];
  useEffect(() => {
    if (latest && (!from || !months.includes(from) || !to || !months.includes(to))) onChange(latest, latest);
  }, [latest, from, to, months, onChange]);
  const fyMonths = useMemo(() => (latest ? months.filter((m) => fyOf(m) === fyOf(latest)) : []), [months, latest]);
  if (!months.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select aria-label="From month" value={from} onChange={(e) => onChange(e.target.value, to)} className="w-28">
        {months.map((m) => (
          <option key={m} value={m}>{monthName(m)}</option>
        ))}
      </Select>
      <span className="text-[13px] text-ink-subtle">to</span>
      <Select aria-label="To month" value={to} onChange={(e) => onChange(from, e.target.value)} className="w-28">
        {months.map((m) => (
          <option key={m} value={m}>{monthName(m)}</option>
        ))}
      </Select>
      <Button variant="ghost" size="sm" onClick={() => onChange(latest, latest)}>Latest</Button>
      {fyMonths.length > 1 && (
        <Button variant="ghost" size="sm" onClick={() => onChange(fyMonths[0], fyMonths[fyMonths.length - 1])}>
          FY {fyOf(latest)}
        </Button>
      )}
    </div>
  );
}

export const inr = (n: number) => `${Math.round(n) < 0 ? "−" : ""}₹${Math.abs(Math.round(n)).toLocaleString("en-IN")}`;
/** Share of a positive total; "—" when the total is zero or negative (a margin on negative revenue means nothing). */
export const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—");
