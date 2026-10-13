"use client";

import { readLocal, writeLocal } from "./local-store";

// Firm weekly offs (Leave Tracker → Leave policy). Kept in a module variable so date helpers stay
// synchronous; seeded from the browser on load and refreshed from the API by <WorkCalendarSync/>.
export interface WeeklyOffs {
  /** "all", "none" or Saturday week-numbers that are off, e.g. "2,4" */
  saturdaysOff: string;
  sundayOff: boolean;
}

const KEY = "asa:work-calendar";
const DEFAULT: WeeklyOffs = { saturdaysOff: "all", sundayOff: true };

function load(): WeeklyOffs {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const v = JSON.parse(readLocal(KEY) ?? "null") as WeeklyOffs | null;
    return v && typeof v.saturdaysOff === "string" ? v : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

let current = load();

export function setWeeklyOffs(next: WeeklyOffs) {
  if (next.saturdaysOff === current.saturdaysOff && next.sundayOff === current.sundayOff) return;
  current = next;
  writeLocal(KEY, JSON.stringify(next));
}

/** Weekly off for a "YYYY-MM-DD" day, per the firm calendar. */
export function isWeeklyOff(ymd: string): boolean {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (dow === 0) return current.sundayOff;
  if (dow !== 6) return false;
  if (current.saturdaysOff === "all") return true;
  if (current.saturdaysOff === "none") return false;
  return current.saturdaysOff.split(",").map(Number).includes(Math.ceil(d / 7));
}
