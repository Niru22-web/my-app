/**
 * Salary calculation for one employee-month — a faithful port of ASA MIS `payroll_calc.py`.
 *
 * Full month (no LOP): the employee's master structure is paid exactly as stored — the master is copied
 * from what each person is actually paid, so this reproduces current pay to the rupee.
 *
 * Partial month (LOP, joining, leaving): mirrors how the firms' salary sheets prorate (reverse-engineered
 * from Apr–Aug 2026):
 *   gross  = full-month gross × paid days / total days
 *   bonus  = fixed monthly bonus (not prorated); if gross < 2 × bonus it's dropped and all of gross is basic
 *   basic  = basic % × gross, but never more than gross − bonus
 *   HRA    = 50% of basic, capped at what's left
 *   conv   = remainder
 *   PF     = 12% of basic, capped at 1,800 (employee and employer alike)
 *   ESIC   = 0.75% (employee) / 3.25% (employer) of basic, rounded up
 *   PT     = Maharashtra slab by gender and gross; 300 instead of 200 in February. Gender unknown → master PT.
 * Every amount stays editable before a month is finalised.
 *
 * Rounding: Python's round() sends exact halves to the even neighbour (round(2.5) = 2), unlike Math.round.
 * pyRound() reproduces that, so results match the MIS sheets to the rupee.
 */

export const PF_RATE = 0.12;
export const PF_CAP = 1800;
export const ESIC_EMPLOYEE_RATE = 0.0075;
export const ESIC_EMPLOYER_RATE = 0.0325;

export interface SalaryStructure {
  basicPct: number;
  bonus: number;
  basic: number;
  hra: number;
  conv: number;
  pt: number;
  pfEmployee: number;
  esicEmployee: number;
  pfEmployer: number;
  esicEmployer: number;
  pfApplicable: boolean;
  esicApplicable: boolean;
  gender?: "M" | "F" | null;
}

export interface SalaryAmounts {
  basic: number;
  hra: number;
  conv: number;
  bonus: number;
  gross: number;
  pt: number;
  pfEmployee: number;
  esicEmployee: number;
  pfEmployer: number;
  esicEmployer: number;
  netPay: number;
  totalDays: number;
  lopDays: number;
  paidDays: number;
}

/** Python 3 round(x): nearest integer, exact halves to the even neighbour. */
export function pyRound(x: number): number {
  const f = Math.floor(x);
  const diff = x - f; // exact for the magnitudes used here
  if (diff > 0.5) return f + 1;
  if (diff < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

export const grossOf = (s: Pick<SalaryStructure, "basic" | "hra" | "conv" | "bonus">) => s.basic + s.hra + s.conv + s.bonus;

/** Days in a YYYY-MM month. */
export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Monthly professional tax (Maharashtra); null when gender is unknown. */
export function maharashtraPt(gross: number, gender: "M" | "F" | null | undefined, month: string): number | null {
  const february = month.endsWith("-02");
  if (gender === "F") {
    if (gross <= 25000) return 0;
    return february ? 300 : 200;
  }
  if (gender === "M") {
    if (gross <= 7500) return 0;
    if (gross <= 10000) return 175;
    return february ? 300 : 200;
  }
  return null;
}

export function calculate(s: SalaryStructure, month: string, totalDaysIn: number, lopDaysIn: number): SalaryAmounts {
  const totalDays = totalDaysIn || daysInMonth(month);
  const lopDays = lopDaysIn || 0;
  const paidDays = Math.max(totalDays - lopDays, 0);
  let a: Omit<SalaryAmounts, "netPay" | "totalDays" | "lopDays" | "paidDays">;

  if (paidDays === totalDays) {
    let pt = s.pt;
    if (month.endsWith("-02") && pt === 200) pt = 300;
    a = {
      basic: s.basic,
      hra: s.hra,
      conv: s.conv,
      bonus: s.bonus,
      gross: grossOf(s),
      pt,
      pfEmployee: s.pfApplicable ? s.pfEmployee : 0,
      esicEmployee: s.esicApplicable ? s.esicEmployee : 0,
      pfEmployer: s.pfApplicable ? s.pfEmployer : 0,
      esicEmployer: s.esicApplicable ? s.esicEmployer : 0,
    };
  } else {
    const gross = pyRound((grossOf(s) * paidDays) / totalDays);
    let bonus: number, basic: number, hra: number;
    if (gross < 2 * s.bonus) {
      // Too little pay to carry the fixed bonus: the sheets put it all in basic.
      bonus = 0;
      basic = gross;
      hra = 0;
    } else {
      bonus = s.bonus;
      basic = Math.min(pyRound(s.basicPct * gross), gross - bonus);
      hra = Math.min(pyRound(0.5 * basic), gross - basic - bonus);
    }
    const conv = gross - basic - bonus - hra;
    const pf = s.pfApplicable ? Math.min(pyRound(PF_RATE * basic), PF_CAP) : 0;
    const pt = gross === 0 ? 0 : maharashtraPt(gross, s.gender ?? null, month);
    a = {
      basic,
      hra,
      conv,
      bonus,
      gross,
      pt: pt === null ? s.pt : pt,
      pfEmployee: pf,
      esicEmployee: s.esicApplicable ? Math.ceil(ESIC_EMPLOYEE_RATE * basic) : 0,
      pfEmployer: pf,
      esicEmployer: s.esicApplicable ? Math.ceil(ESIC_EMPLOYER_RATE * basic) : 0,
    };
  }
  return { ...a, netPay: a.gross - a.pt - a.pfEmployee - a.esicEmployee, totalDays, lopDays, paidDays };
}

/** (days in month, LOP days from joining/leaving mid-month, remark) — MIS `_employed_days`. */
export function employedDays(e: { dateOfJoining: string | null; dateOfLeaving: string | null }, month: string) {
  const total = daysInMonth(month);
  const first = `${month}-01`;
  const last = `${month}-${String(total).padStart(2, "0")}`;
  const dayNo = (ymd: string) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) / 86_400_000;
  const dmy = (ymd: string) => `${ymd.slice(8, 10)}-${ymd.slice(5, 7)}-${ymd.slice(0, 4)}`;
  let lop = 0;
  const notes: string[] = [];
  if (e.dateOfJoining && first < e.dateOfJoining && e.dateOfJoining <= last) {
    lop += dayNo(e.dateOfJoining) - dayNo(first);
    notes.push(`Joined ${dmy(e.dateOfJoining)}`);
  }
  if (e.dateOfLeaving && first <= e.dateOfLeaving && e.dateOfLeaving < last) {
    lop += dayNo(last) - dayNo(e.dateOfLeaving);
    notes.push(`Left ${dmy(e.dateOfLeaving)}`);
  }
  return { total, lop, remark: notes.join("; ") || null };
}

/** Whether someone is on that month's payroll — MIS `_is_employed`. */
export function isEmployed(e: { dateOfJoining: string | null; dateOfLeaving: string | null; status: string }, month: string): boolean {
  const first = `${month}-01`;
  const last = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  if (e.dateOfJoining && e.dateOfJoining > last) return false;
  if (e.dateOfLeaving && e.dateOfLeaving < first) return false;
  if (e.status === "Left" && !(e.dateOfLeaving && e.dateOfLeaving >= first)) return false;
  return true;
}
