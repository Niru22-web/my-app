# HR, Onboarding & Payroll — Roadmap

**Status:** proposal · 13 Oct 2026
**Rule:** new tables only, added through a reviewed migration. Existing tables and columns are never altered or dropped.

What exists today: invite → self-registration → HR approval, an employee profile (PAN, Aadhaar, bank, emergency contact), leave with a flat yearly balance, web attendance, timesheets, reimbursements, and a basic `Payroll` table (basic, allowances, deductions, net) used by Accounts → Payables.

---

## 1. Hire to join (onboarding)

| Feature | What it does |
|---|---|
| Candidate & offer | HR creates a candidate (name, email, role, partner/manager, joining date, CTC) and generates an **offer letter** from a template; the candidate accepts online; status: Draft → Sent → Accepted / Declined / Withdrawn |
| Letter templates | Offer, appointment, confirmation, increment, relieving, experience, salary certificate — rich text with `{{placeholders}}`, firm letterhead, signatory; printed to PDF |
| Pre-joining checklist | Candidate uploads PAN, Aadhaar, photo, bank proof, education, previous employer relieving letter / Form 16 / UAN before day 1 (reuses the registration page) |
| Onboarding tasks | Per-joiner checklist assigned to IT (laptop from Asset Management, email), HR (ID card, policies), manager (buddy, first jobs); due dates and reminders |
| Policy acknowledgements | Employee reads and accepts policies (leave, IT, code of conduct); stored with timestamp (Zoho's "Acknowledgement receipts" / "Consent receipts") |
| Probation & confirmation | Probation end date, manager review, confirmation letter |

## 2. Payroll

| Feature | What it does |
|---|---|
| Salary structures | Templates of components (Basic, HRA, Special allowance, LTA, Conveyance, Bonus…) as % of CTC / % of Basic / fixed; earnings vs deductions; taxable or not |
| Employee CTC & revisions | Each person's CTC and structure with effective dates; increment history; increment letter |
| Monthly payroll run | Draft → Review → Locked → Paid. Uses **Attendance data for payroll** + **Leave data for payroll** (payable days, LOP) already built in Reports; prorates for joiners/leavers; adds approved reimbursements; arrears, one-time earnings/deductions |
| Statutory deductions | **PF** (employee 12% of PF wage, employer EPF/EPS split, wage ceiling configurable), **ESI** (0.75% / 3.25% when gross ≤ threshold), **Professional Tax** (state slab table — Maharashtra: ₹200/month, ₹300 in February, configurable), **LWF** (June / December), **TDS** (old vs new regime choice, monthly projection) — every rate and threshold is a configurable table, not code |
| Tax declarations | Employee declares investments (80C, 80D, HRA rent, home loan) at year start, uploads proofs later; HR verifies |
| Payslips | PDF payslip per month (firm letterhead, earnings, deductions, YTD, net in words); employees see theirs in My Portal; emailed when email is live |
| Bank file | Bulk salary transfer file for the firm's bank (format to confirm) |
| Statutory outputs | PF ECR text file, ESI contribution file, PT summary, TDS / Form 24Q data, Form 16 Part B data |
| Accounts link | Locked payroll posts to the existing `Payroll` table and Ledger, so Accounts → Payables keeps working unchanged |

## 3. Exit

| Feature | What it does |
|---|---|
| Resignation | Employee submits, manager/partner accepts, notice period and last working day |
| Clearance | Asset return (from Asset Management), IT access removal, finance dues, handover sign-offs |
| Full & final | Final salary, leave encashment, notice recovery, gratuity (after 5 years), F&F statement |
| Letters & records | Relieving and experience letters; **exit date and reason** recorded — this also enables the attrition reports Zoho has (Employee attrition trend, Experience-wise exit) |

## 4. Other gaps found while comparing with Zoho People

| Gap | Why it matters |
|---|---|
| Leave policies | Leave types are a fixed list with a flat 21-day balance. Needed: per-type entitlement, monthly accrual, carry-forward caps, encashment, sandwich rule, LOP — feeds payroll |
| Attendance regularisation | Employees request a correction for a missed punch; manager approves (today only HR/Admin can edit) |
| Remote / office check-in | Zoho's "Office In and Remote In" — tag each check-in as office or remote |
| Scheduled reports | Zoho "Schedulers": email a report (e.g. Muster roll, Timesheet data for payroll) on a schedule — needs background jobs + email (parity blockers B1/B2) |
| Career history | Designation / role / CTC changes over time (comes with salary revisions) |
| Announcements | Firm-wide notices with read receipts |

## 5. Suggested order

1. **Go-live blockers first** (from `FEATURE_PARITY.md`): background jobs, real email, ESSL sync.
2. **Leave policies** — payroll depends on correct leave and LOP.
3. **Payroll core** — structures, CTC, monthly run, PF/ESI/PT/TDS, payslips, bank file.
4. **Onboarding** — offer letters, pre-joining, tasks, acknowledgements.
5. **Exit & F&F**, then letters for every stage.
6. Statutory files, tax declarations, scheduled reports.

## 6. Inputs needed from the firm before payroll is built

1. Current salary structure (components and how each is computed) — a sample salary breakup / CTC sheet is enough
2. Is the firm registered for **PF** and **ESI**? PF on full basic or capped at ₹15,000?
3. Professional Tax state(s) — Maharashtra only, or also Rajasthan / Gujarat / Telangana for remote staff?
4. Salary bank (for the bulk transfer file format)
5. Current offer / appointment letter (Word or PDF) to turn into templates
6. Leave policy: entitlement per type, accrual, carry-forward, encashment
7. Payroll cycle: month-end cut-off and pay date
8. Who approves payroll before it is locked
