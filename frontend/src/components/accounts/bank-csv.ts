/** Reads a bank statement CSV into statement lines. Unreadable lines are kept with a problem, never guessed. */

export interface ParsedStatementLine {
  /** Line number in the file (1-based, header included). */
  line: number;
  date: string;
  description: string;
  bankReference: string;
  type: "CREDIT" | "DEBIT";
  amount: number;
  balance: number | null;
  /** Why the line can't be imported; empty when it's fine. */
  problem: string;
}

export function parseCsvRows(text: string): { cells: string[]; line: number }[] {
  const rows: { cells: string[]; line: number }[] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let start = 1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else {
        if (ch === "\n") line++;
        field += ch;
      }
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      cur.push(field.trim());
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      cur.push(field.trim());
      if (cur.some(Boolean)) rows.push({ cells: cur, line: start });
      cur = [];
      field = "";
      line++;
      start = line;
    } else field += ch;
  }
  if (field.length || cur.length) {
    cur.push(field.trim());
    if (cur.some(Boolean)) rows.push({ cells: cur, line: start });
  }
  return rows;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

/** YYYY-MM-DD, or "" when the date can't be read with certainty. Indian statements are day-first. */
export function normalizeDate(raw: string): string {
  const s = raw.trim().replace(/\s+\d{1,2}:\d{2}(:\d{2})?(\s*[ap]m)?$/i, "");
  let y = 0, m = 0, d = 0;
  let r: RegExpMatchArray | null;
  if ((r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/))) [d, m, y] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = s.match(/^(\d{1,2})[\s/-]([A-Za-z]{3,4})[A-Za-z]*[\s/-](\d{2}|\d{4})$/))) [d, m, y] = [Number(r[1]), MONTHS[r[2].toLowerCase()] ?? 0, Number(r[3])];
  else return "";
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (!m || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return "";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function cleanNum(raw?: string): number | null {
  if (raw == null) return null;
  let s = raw.trim();
  if (!s) return null;
  let sign = 1;
  const suffix = /\s*(cr|dr)\.?$/i.exec(s);
  if (suffix) {
    if (suffix[1].toLowerCase() === "dr") sign = -1;
    s = s.slice(0, suffix.index);
  }
  if (/^\(.*\)$/.test(s)) {
    sign = -sign;
    s = s.slice(1, -1);
  }
  s = s.replace(/INR|Rs\.?|[₹$,\s]/gi, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? sign * n : null;
}

/** Header name → normalised words ("Withdrawal Amt. (INR)" → "withdrawal amount"). */
const norm = (h: string) =>
  h
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bamt\b/g, "amount")
    .replace(/\b(inr|rs)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const HEADERS = {
  date: ["date", "txn date", "transaction date", "tran date", "posting date", "value date"],
  desc: ["description", "narration", "particulars", "remarks", "details", "transaction details", "transaction remarks", "transaction description"],
  ref: ["ref", "ref no", "reference", "reference no", "reference number", "utr", "utr no", "utr number", "chq no", "cheque no", "chq ref no", "cheque ref no", "chq ref number", "txn id", "transaction id"],
  credit: ["credit", "credits", "deposit", "deposits", "cr", "cr amount", "credit amount", "deposit amount"],
  debit: ["debit", "debits", "withdrawal", "withdrawals", "dr", "dr amount", "debit amount", "withdrawal amount"],
  amount: ["amount", "txn amount", "transaction amount"],
  type: ["type", "dr cr", "cr dr", "txn type", "transaction type"],
  balance: ["balance", "closing balance", "running balance", "available balance"],
} as const;

/** Exact header match, in the priority order of the list (so "Txn Date" beats "Value Date"). */
function findCol(headers: string[], names: readonly string[]) {
  for (const n of names) {
    const i = headers.indexOf(n);
    if (i >= 0) return i;
  }
  return -1;
}

export interface ParseResult {
  lines: ParsedStatementLine[];
  /** Set when no usable header row was found. */
  error: string;
}

export function parseBankCsv(text: string): ParseResult {
  const rows = parseCsvRows(text);
  // Statements often start with account details; the header is the first row with a date and an amount column.
  let h = -1;
  let cols: Record<keyof typeof HEADERS, number> | null = null;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const headers = rows[i].cells.map(norm);
    const c = Object.fromEntries(Object.entries(HEADERS).map(([k, names]) => [k, findCol(headers, names)])) as Record<keyof typeof HEADERS, number>;
    if (c.date >= 0 && (c.credit >= 0 || c.debit >= 0 || c.amount >= 0)) {
      h = i;
      cols = c;
      break;
    }
  }
  if (h < 0 || !cols) return { lines: [], error: "Couldn’t find the column headings. The file needs a Date column and either Credit/Debit or Amount columns." };

  const out: ParsedStatementLine[] = [];
  for (const { cells: r, line } of rows.slice(h + 1)) {
    const get = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
    const rawDate = get(cols.date);
    const description = get(cols.desc);
    const bankReference = get(cols.ref);
    let amount = 0;
    let type: "CREDIT" | "DEBIT" = "CREDIT";
    if (cols.credit >= 0 || cols.debit >= 0) {
      const cr = cleanNum(get(cols.credit)) ?? 0;
      const dr = cleanNum(get(cols.debit)) ?? 0;
      if (Math.abs(cr) > 0) [amount, type] = [Math.abs(cr), "CREDIT"];
      else if (Math.abs(dr) > 0) [amount, type] = [Math.abs(dr), "DEBIT"];
    } else {
      const a = cleanNum(get(cols.amount)) ?? 0;
      const t = get(cols.type).toUpperCase();
      amount = Math.abs(a);
      type = a < 0 || /^(D|DR|DEBIT|WITHDRAWAL)\b/.test(t) ? "DEBIT" : "CREDIT";
    }
    const date = normalizeDate(rawDate);
    // Totals/footer rows: no readable date and no description.
    if (!date && !description) continue;
    const balRaw = get(cols.balance);
    const balance = balRaw ? cleanNum(balRaw) : null;
    const problem = !rawDate ? "no date" : !date ? `date “${rawDate}” isn’t recognised` : !(amount > 0) ? "no amount" : !description ? "no description" : "";
    out.push({ line, date, description, bankReference, type, amount: Math.round(amount * 100) / 100, balance, problem });
  }
  return { lines: out, error: out.length ? "" : "No statement lines were found below the column headings." };
}
