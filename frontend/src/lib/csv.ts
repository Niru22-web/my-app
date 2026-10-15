/** A cell value for CSV export. */
export type CsvCell = string | number | boolean | null | undefined;

/**
 * Downloads rows as a CSV file that opens cleanly in Excel (UTF-8 BOM, CRLF).
 * Text starting with = + - @ is prefixed with ' so Excel never runs it as a formula.
 */
export function downloadCsv(name: string, header: string[], rows: CsvCell[][]) {
  const esc = (v: CsvCell) => {
    let s = v == null ? "" : String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob(["﻿" + [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name.endsWith(".csv") ? name : `${name}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
