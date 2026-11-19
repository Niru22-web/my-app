import ExcelJS from "exceljs";

/**
 * Tally export parsing — a port of ASA MIS etl/tally_etl.py and ledger_master_etl.py.
 *
 * Register files are Tally "columnar" voucher exports: a few title rows, then a header row whose first cell is
 * "Date" (fixed columns, then "Gross Total", then one column per ledger hit), one row per voucher, and a final
 * "Grand Total" row. Tally exports amounts as positive numbers and marks Cr only in the cell's number format,
 * so Cr amounts are made negative here (accounting convention: Dr +, Cr −).
 */

export class TallyParseError extends Error {}

/** Normalise a ledger/column name the way the MIS does (Tally's _x000D_ artefact, spacing, "@" spacing). */
export function cleanHeader(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/_x000D_/g, " ").split(/\s+/).filter(Boolean).join(" ").replace(/ @/g, "@").replace(/@ /g, "@").trim();
}

type Cell = { value: unknown; numFmt?: string };

/** The plain value of an exceljs cell (formula results, rich text, hyperlinks…). */
function plain(v: unknown): unknown {
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const o = v as Record<string, unknown>;
    if ("result" in o) return plain(o.result);
    if ("richText" in o && Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if ("text" in o) return o.text;
    if ("error" in o) return null;
  }
  return v;
}

function signed(c: Cell | undefined): unknown {
  if (!c) return null;
  const v = plain(c.value);
  if (typeof v === "number" && c.numFmt && c.numFmt.toLowerCase().includes("cr")) return -v;
  return v;
}

/** Loads the first worksheet's rows as arrays of signed values; refuses legacy binary .xls with a clear message. */
async function readRows(buf: Buffer, sheetName?: string): Promise<unknown[][]> {
  if (buf.length >= 4 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0) {
    throw new TallyParseError("This is an old binary .xls file. Open it in Excel and Save As .xlsx, then upload that.");
  }
  if (!(buf[0] === 0x50 && buf[1] === 0x4b)) throw new TallyParseError("This doesn’t look like an Excel (.xlsx) file.");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = sheetName ? wb.getWorksheet(sheetName) ?? wb.worksheets[0] : wb.worksheets[0];
  if (!ws) throw new TallyParseError("The workbook has no sheets.");
  const rows: unknown[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const out: unknown[] = [];
    const n = row.cellCount;
    for (let c = 1; c <= n; c++) out.push(signed(row.getCell(c) as unknown as Cell));
    rows[rowNumber - 1] = out;
  });
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
  return rows;
}

const isoDate = (v: unknown): string | null => {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[-/ ]([A-Za-z]{3}|\d{1,2})[-/ ](\d{2,4})$/);
  if (m) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const mon = /\d/.test(m[2]) ? Number(m[2]) : months.indexOf(m[2].toLowerCase()) + 1;
    const yr = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    if (mon >= 1) return `${yr}-${String(mon).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};

const strId = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "number" && Number.isInteger(v) ? String(v) : String(v).trim());
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

export interface VoucherRow {
  rowKey: string;
  date: string | null;
  particulars: string | null;
  voucherType: string | null;
  voucherNo: string;
  narration: string | null;
  grossTotal: number;
  ledger: string;
  value: number;
}

export interface ParsedRegister {
  register: string;
  rows: VoucherRow[];
  vouchers: number;
  tallyGrandTotal: number;
}

/** Parses one register export (MIS parse_register_file). `register` is the file name without extension. */
export async function parseRegister(buf: Buffer, register: string, entityName: string): Promise<ParsedRegister> {
  const raw = await readRows(buf);
  const headerIdx = raw.findIndex((r) => r.length && cleanHeader(r[0]).toLowerCase() === "date");
  if (headerIdx < 0) throw new TallyParseError(`Couldn’t find the header row (first cell “Date”) in ${register}.`);
  const headers = raw[headerIdx].map(cleanHeader);
  const lower = headers.map((h) => h.toLowerCase());
  const grossIdx = lower.indexOf("gross total");
  if (grossIdx < 0) throw new TallyParseError(`Couldn’t find the “Gross Total” column in ${register}.`);
  const col = (name: string) => {
    const i = lower.indexOf(name);
    return i < 0 ? null : i;
  };
  const iDate = col("date")!;
  const iPart = col("particulars");
  const iType = col("voucher type");
  const iNo = col("voucher no.");
  const iNarr = col("narration");
  const ledgerCols = headers.map((h, i) => [i, h] as const).filter(([i, h]) => i > grossIdx && h);

  const rows: VoucherRow[] = [];
  const keyCounts = new Map<string, number>();
  let vouchers = 0;
  let tallyGrandTotal = 0;

  for (const row of raw.slice(headerIdx + 1)) {
    if (!row.length || row[iDate] === null || row[iDate] === undefined || row[iDate] === "") {
      const part = row.length && iPart !== null ? cleanHeader(row[iPart]) : "";
      if (row.length && part.toLowerCase() === "grand total") {
        for (const [ci] of ledgerCols) {
          const v = row[ci];
          if (v !== null && v !== undefined && v !== "") tallyGrandTotal += Number(v);
        }
      }
      break;
    }
    vouchers++;
    const date = isoDate(row[iDate]);
    const particulars = iPart !== null && row[iPart] != null ? String(row[iPart]) : null;
    const voucherType = iType !== null && row[iType] != null ? String(row[iType]) : null;
    const voucherNo = iNo !== null ? strId(row[iNo]) : "";
    const narration = iNarr !== null && row[iNarr] != null ? String(row[iNarr]) : null;
    const grossTotal = num(row[grossIdx]) ?? 0;
    for (const [ci, ledger] of ledgerCols) {
      if (ci >= row.length) continue;
      const v = row[ci];
      if (v === null || v === undefined || v === "") continue;
      const value = Number(v);
      if (!Number.isFinite(value)) continue;
      const base = [entityName, register, String(voucherType), voucherNo, date ?? "", ledger].join("|");
      const n = (keyCounts.get(base) ?? 0) + 1;
      keyCounts.set(base, n);
      rows.push({ rowKey: n === 1 ? base : `${base}#${n}`, date, particulars, voucherType, voucherNo, narration, grossTotal, ledger, value });
    }
  }
  return { register, rows, vouchers, tallyGrandTotal };
}

export interface LedgerRow {
  firm: string;
  ledgerName: string;
  parent: string | null;
  primaryGroup: string | null;
  openingBalance: number | null;
  closingBalance: number | null;
}

/**
 * Parses a Tally Ledger Masters export (MIS parse_ledger_master): columns Firm Name, $Name, $Parent,
 * $_PrimaryGroup, $OpeningBalance, $_ClosingBalance. Uses the "Tally Ledger Masters" sheet when present.
 * A file without "Firm Name" is accepted when the caller supplies the firm.
 */
export async function parseLedgerMasters(buf: Buffer, defaultFirm: string | null): Promise<LedgerRow[]> {
  const raw = await readRows(buf, "Tally Ledger Masters");
  const headerIdx = raw.findIndex((r) => r.some((c) => cleanHeader(c) === "$Name"));
  if (headerIdx < 0) throw new TallyParseError("Couldn’t find the “$Name” column — export the Ledger Masters with Tally’s field names ($Name, $Parent, $_PrimaryGroup…).");
  const h = raw[headerIdx].map(cleanHeader);
  const idx = (name: string) => h.indexOf(name);
  const iFirm = idx("Firm Name");
  if (iFirm < 0 && !defaultFirm) throw new TallyParseError("The file has no “Firm Name” column — choose the firm it belongs to.");
  const out: LedgerRow[] = [];
  for (const row of raw.slice(headerIdx + 1)) {
    const firm = iFirm >= 0 ? cleanHeader(row[iFirm]) : defaultFirm!;
    const name = cleanHeader(row[idx("$Name")]);
    if (!firm || !name) continue;
    out.push({
      firm,
      ledgerName: name,
      parent: cleanHeader(row[idx("$Parent")]) || null,
      primaryGroup: cleanHeader(row[idx("$_PrimaryGroup")]) || null,
      openingBalance: idx("$OpeningBalance") >= 0 ? num(row[idx("$OpeningBalance")]) : null,
      closingBalance: idx("$_ClosingBalance") >= 0 ? num(row[idx("$_ClosingBalance")]) : null,
    });
  }
  return out;
}
