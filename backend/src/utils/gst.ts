/**
 * GST place-of-supply and document-numbering rules.
 * frontend/src/lib/gst.ts holds an identical copy for the invoice preview — keep the two in step.
 */

export const STATE_CODES: Record<string, string> = {
  "Jammu and Kashmir": "01", "Himachal Pradesh": "02", Punjab: "03", Chandigarh: "04", Uttarakhand: "05",
  Haryana: "06", Delhi: "07", Rajasthan: "08", "Uttar Pradesh": "09", Bihar: "10", Sikkim: "11",
  "Arunachal Pradesh": "12", Nagaland: "13", Manipur: "14", Mizoram: "15", Tripura: "16", Meghalaya: "17",
  Assam: "18", "West Bengal": "19", Jharkhand: "20", Odisha: "21", Chhattisgarh: "22", "Madhya Pradesh": "23",
  Gujarat: "24", "Dadra and Nagar Haveli and Daman and Diu": "26", Maharashtra: "27", Karnataka: "29", Goa: "30",
  Lakshadweep: "31", Kerala: "32", "Tamil Nadu": "33", Puducherry: "34", "Andaman and Nicobar Islands": "35",
  Telangana: "36", "Andhra Pradesh": "37", Ladakh: "38",
};
export const STATE_BY_CODE: Record<string, string> = Object.fromEntries(Object.entries(STATE_CODES).map(([n, c]) => [c, n]));
/** Place-of-supply code used for supplies outside India. */
export const EXPORT_CODE = "96";

export type SupplyType = "INTRA" | "INTER" | "EXPORT" | "NO_GST";

export interface PartyForGst {
  gstin?: string | null;
  state?: string | null;
  country?: string | null;
}

export interface PlaceOfSupply {
  supplyType: SupplyType;
  /** State code of the place of supply, "96" for exports, null when it can't be determined */
  code: string | null;
  label: string;
  /** Why the invoice can't be issued yet, if anything */
  problem: string | null;
}

const stateCodeOf = (p: PartyForGst): string | null => {
  const g = p.gstin?.trim();
  if (g && /^\d{2}/.test(g)) return g.slice(0, 2);
  const s = p.state?.trim();
  if (!s) return null;
  const hit = Object.keys(STATE_CODES).find((n) => n.toLowerCase() === s.toLowerCase());
  return hit ? STATE_CODES[hit] : null;
};

/**
 * Services (SAC 99xx) — place of supply is the recipient's location (IGST Act s.12(2)):
 * registered client → state in its GSTIN; unregistered → its address state; outside India → export.
 * Same state as the supplier's GSTIN → CGST + SGST; otherwise IGST. A supplier without a GSTIN charges no GST.
 */
export function placeOfSupply(entity: PartyForGst, client: PartyForGst): PlaceOfSupply {
  const supplier = stateCodeOf({ gstin: entity.gstin });
  if (!supplier) return { supplyType: "NO_GST", code: null, label: "No GST (entity not GST-registered)", problem: null };
  const country = (client.country ?? "India").trim().toLowerCase();
  if (country && country !== "india") return { supplyType: "EXPORT", code: EXPORT_CODE, label: `Outside India (${client.country}) — export of services`, problem: null };
  const recipient = stateCodeOf(client);
  if (!recipient) {
    return { supplyType: "INTRA", code: null, label: "Unknown", problem: "Add the client's GSTIN or state, so the place of supply (and CGST/SGST vs IGST) is right." };
  }
  const name = STATE_BY_CODE[recipient] ?? `State ${recipient}`;
  return recipient === supplier
    ? { supplyType: "INTRA", code: recipient, label: `${name} (${recipient}) — intra-state`, problem: null }
    : { supplyType: "INTER", code: recipient, label: `${name} (${recipient}) — inter-state`, problem: null };
}

/** Splits a line's GST by supply type. Exports and NO_GST carry IGST/none as entered (0% under LUT). */
export function splitTax(gst: number, supply: SupplyType) {
  const r = (n: number) => Math.round(n * 100) / 100;
  if (supply === "INTRA") {
    const half = r(gst / 2);
    return { cgst: half, sgst: r(gst - half), igst: 0 };
  }
  if (supply === "NO_GST") return { cgst: 0, sgst: 0, igst: 0 };
  return { cgst: 0, sgst: 0, igst: r(gst) };
}

/** Indian financial year for a date: Apr–Mar, written "2026-27". */
export function financialYear(d: Date): string {
  const ist = new Date(d.getTime() + 330 * 60_000);
  const y = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

export const DOC_CODE: Record<string, string> = { INVOICE: "", CREDIT_NOTE: "CN", RECEIPT: "RC" };

/** Invoice-series prefix: letters/digits/hyphen only, up to 8 characters. */
export function cleanPrefix(raw: unknown, fallbackName = "INV"): string {
  const p = String(raw ?? "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 8);
  if (p) return p;
  const initials = fallbackName.split(/\s+/).map((w) => w[0] ?? "").join("").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (initials || "INV").slice(0, 4);
}

/**
 * Document number, e.g. ASA/2026-27/0001 or ASA-CN/2026-27/0001. GST rule 46(b): at most 16 characters,
 * only letters, digits, "/" and "-", unique per financial year. Shortens the year, then the prefix, to fit.
 */
export function formatDocNumber(prefix: string, docType: string, fy: string, n: number): string {
  const code = DOC_CODE[docType] ?? "";
  const seq = String(n).padStart(4, "0");
  const fyShort = fy.slice(2); // "26-27"
  const fyTiny = fy.slice(2, 4) + fy.slice(5, 7); // "2627"
  let p = code ? `${prefix}-${code}` : prefix;
  for (const y of [fy, fyShort, fyTiny]) {
    const s = `${p}/${y}/${seq}`;
    if (s.length <= 16) return s;
  }
  while (p.length > 1 && `${p}/${fyTiny}/${seq}`.length > 16) p = p.slice(0, -1);
  return `${p}/${fyTiny}/${seq}`;
}
