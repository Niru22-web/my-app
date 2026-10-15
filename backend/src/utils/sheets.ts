import fs from "fs";
import ExcelJS from "exceljs";
import type { FastifyReply } from "fastify";

/** Sends an Excel workbook as a download. */
export async function sendWorkbook(reply: FastifyReply, wb: ExcelJS.Workbook, filename: string) {
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return reply
    .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    .header("Content-Disposition", `attachment; filename="${filename}"`)
    .send(buf);
}

export interface TemplateColumn {
  header: string;
  required?: boolean;
  example: string | number;
  help: string;
  width?: number;
}

/** Import template: the columns, one sample row (to be replaced), and a "How to fill" sheet. */
export function templateWorkbook(sheetName: string, columns: TemplateColumn[], notes: string[] = []) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.columns = columns.map((c) => ({ header: c.required ? `${c.header} *` : c.header, width: c.width ?? Math.max(14, c.header.length + 4) }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF003887" } };
  ws.addRow(columns.map((c) => c.example)).font = { italic: true, color: { argb: "FF6B7280" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  columns.forEach((_, i) => (ws.getColumn(i + 1).numFmt = "@"));

  const help = wb.addWorksheet("How to fill");
  help.columns = [
    { header: "Column", width: 28 },
    { header: "Required", width: 10 },
    { header: "What to enter", width: 90 },
  ];
  help.getRow(1).font = { bold: true };
  for (const c of columns) help.addRow([c.header, c.required ? "Yes" : "", c.help]);
  help.addRow([]);
  for (const n of ["Replace the grey sample row with your data (or delete it).", "Dates: YYYY-MM-DD (e.g. 2026-04-01) or DD-MM-YYYY.", "The file is checked first; nothing is saved until every row is valid.", ...notes]) {
    help.addRow([n]);
  }
  return wb;
}

/** Normalises a header for matching: lower case, letters and digits only, "*" ignored. */
export const headerKey = (h: string) => h.toLowerCase().replace(/\*/g, "").replace(/[^a-z0-9]/g, "");

/** Reads the first sheet of an .xlsx, or a .csv, into rows of trimmed strings (dates as YYYY-MM-DD). */
export async function readSheet(path: string, name: string): Promise<string[][]> {
  if (/\.csv$/i.test(name)) {
    return fs
      .readFileSync(path, "utf8")
      .replace(/^﻿/, "")
      .split(/\r?\n/)
      .map((line) => splitCsv(line));
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.worksheets[0];
  const out: string[][] = [];
  const width = ws?.columnCount ?? 0;
  ws?.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let c = 1; c <= width; c++) {
      const v = row.getCell(c).value as unknown;
      if (v instanceof Date) cells.push(v.toISOString().slice(0, 10));
      else if (v && typeof v === "object" && "text" in (v as object)) cells.push(String((v as { text: unknown }).text).trim());
      else if (v && typeof v === "object" && "result" in (v as object)) cells.push(String((v as { result: unknown }).result ?? "").trim());
      else cells.push(v === null || v === undefined ? "" : String(v).trim());
    }
    out.push(cells);
  });
  return out;
}

/** One CSV line, honouring quoted fields with commas and doubled quotes. */
export function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** YYYY-MM-DD from "2026-04-01", "01-04-2026", "01/04/2026" or "1.4.2026"; null if unreadable. */
export function parseDay(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return valid(+m[3], +m[2], +m[1]);
  return null;
}
function valid(y: number, mo: number, d: number) {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
}
