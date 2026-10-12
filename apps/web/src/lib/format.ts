// Display formatting shared by every screen. All figures shown in the portal
// come from the API; these helpers only format them, never invent them.

const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const NUM = new Intl.NumberFormat("en-IN");

export function formatNumber(value: number | null | undefined): string {
  return value == null || Number.isNaN(value) ? "—" : NUM.format(value);
}

const INR_PAISE = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Whole rupees when the amount is whole; paise are shown when present (never rounded away). */
export function formatCurrency(value: number | null | undefined, currency = "INR"): string {
  if (value == null || Number.isNaN(value)) return "—";
  const whole = Math.abs(value - Math.round(value)) < 0.005;
  if (currency === "INR") return whole ? INR.format(value) : INR_PAISE.format(value);
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: whole ? 0 : 2, minimumFractionDigits: whole ? 0 : 2 }).format(value);
}

export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${formatNumber(n)} ${n === 1 ? word : pluralWord}`;
}

export function formatHours(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const h = Math.floor(value);
  const m = Math.round((value - h) * 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatDate(value: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", opts ?? { day: "2-digit", month: "short", year: "numeric" });
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
