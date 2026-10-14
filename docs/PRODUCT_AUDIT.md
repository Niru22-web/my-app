# ASA Portal — Product Audit

**Date:** 14 Oct 2026 · **Method:** seven independent reviews — live role-by-role API testing (7 roles × 174 routes), people-module and business-module code audits, security review, UI/UX review, plus a hands-on walkthrough as an employee on a phone.
**Out of scope (agreed):** background jobs (reminders, auto check-out), real email sending, biometric sync.

## Verdict

**Not ready for go-live yet.** The foundation is solid — every screen exists, the design system is consistent, there is no fake data, SQL injection and password leaks are closed, and the newer modules (Reports, Leave rules, two-step approval) are well built. But testing found **critical access-control holes that were actually exploited on test accounts** (a manager made itself Admin; anyone could download KYC files without logging in), several **money-handling flaws in Accounts** that would produce wrong ledgers and non-compliant GST invoices, and a set of **workflows that silently do nothing** (project team assignment, help-desk auto-assignment, invite delivery).

| Area | State | Biggest problems |
|---|---|---|
| Security & access | 🔴 Critical | Role self-promotion, public KYC files, unauthenticated live notifications, stale logins, no login rate limit |
| Accounts & Finance | 🔴 Critical | Invoices not posted to ledger, non-GST-compliant numbering, issued invoices editable, auto-match pays wrong person, no credit notes/TDS |
| Management & Onboarding | 🟠 High | Team assignments dropped, invites never delivered, role/salary editable by managers, no exit workflow |
| Reimbursements | 🟠 High | Any manager approves any claim; paid claims can be sent back and re-paid |
| Timesheets | 🟡 Medium | Export missing, approved entries can be rejected, edits skip the daily cap, no weekly entry/period lock |
| Attendance | 🟡 Medium | Force check-out records wrong hours, UTC day boundary, no regularisation requests, status always "Present" |
| Leave Tracker | 🟡 Medium | Approved leave cancellable alone, any manager edits holidays (rewrites balances), edit/cross-year maths |
| Help Desk | 🟡 Medium | No auto-assignment, assignee never shown, no notifications, only IT/Admin can work tickets |
| Assets | 🟡 Medium | Double assignment possible, returning an old allocation frees someone else's laptop, no movement history |
| Administration | 🟠 High | Permission matrix mostly not enforced, fake "connected/sent" email status, "clear old logs" deletes all |
| Dashboards | 🟡 Medium | Firm-wide counts shown to managers, UTC "today", no error states, no partner/HR views |
| Reports | 🟡 Medium | Draft hours counted as pending, leavers dropped, payable-days maths, no WIP/realisation (needs a rate card) |
| UI/UX | 🟢 Good base | Low-contrast hint text, mouse-only table rows, dark-mode overlay, developer wording in screens |

## Critical (fix before anyone else uses it)

1. **Privilege escalation** — Manager/Partner/IT can edit any employee incl. their own role (tested: Manager → Admin, then opened Admin & Accounts), salary, status, bank details; `PUT {}` returns unredacted Aadhaar/PAN/bank. `backend/src/modules/employees.routes.ts:306-421`
2. **KYC files public** — `/uploads/*` needs no login (tested: PAN PDF downloaded anonymously); profile API hands every employee the file links. `system.routes.ts:71`
3. **Live notifications unauthenticated** — anyone can subscribe to another person's notification stream. `plugins/socket.ts`
4. **Account lock-out by non-HR** — Accountant rejected HR's account; Manager deactivated someone outside their team. `employees.routes.ts:425-499`
5. **Invoices never reach the ledger**; **invoice numbering not GST-compliant** (global, calendar year, gaps, races); **bank auto-match marks the wrong person's claim/salary PAID**. `accounts.routes.ts`
6. **Paid reimbursements can be sent back, edited and paid again**; any manager approves any claim. `reimbursements.routes.ts`

## High

- Logins keep working for up to 2 days after deactivation/demotion; password change doesn't sign out other sessions; no login rate limit; login reveals which emails exist
- Every employee can read colleagues' DOB, family/emergency contacts, gender (profile API)
- Project/job team assignments are silently discarded; client "partner" dropdown always empty
- Invites/password resets are never delivered but the UI says "sent"; invited people can be approved before registering; resend can lock out an active employee
- Issued invoices editable (any status); GST CGST/SGST vs IGST differs between preview and saved invoice; un-reconcile leaves receipts behind; receipts can't be reversed
- Permission matrix in Administration is mostly not enforced on the server
- Employees can change their own PAN/Aadhaar/bank/joining date/gender (affects leave accrual)
- Timesheet export button calls a missing endpoint; approved time can be rejected; profile document download missing
- Help desk ignores assignee/auto-assign; ticket page always shows "Unassigned"
- Approved leave can be cancelled without approval; any manager can add/delete firm holidays (rewrites past balances)
- Asset return/transfer don't check the allocation is current; double assignment race
- Reports: draft hours counted as "pending"; leavers vanish from past payroll/muster; payable days count pre-joining/future days
- Public registration endpoint writes up to 500 MB per request before checking the token

## Missing features (Must-have, by module)

- **Timesheets:** weekly grid with copy-last-week & submit-week · period lock · job budget vs actual · warnings on leave/holiday days
- **Attendance:** regularisation (missed-punch) requests · late/half-day/absent against the 11–8 shift · "not checked in today" view
- **Leave:** cancel-approved-leave request · team leave calendar · employee comp-off request with expiry
- **Reimbursements:** category limits & policy · receipt mandatory above a threshold · mileage · bill-to-client
- **Help desk:** auto-assign + notify · business-hours SLA with escalation · internal notes · requester close/reopen · HR/Finance agents
- **Management:** exit workflow (LWD, F&F, asset recovery) · audit trail of role/salary/status changes · project billing fields (fee, budget hours, engagement partner)
- **Onboarding:** invite link copy/resend with Invited/Expired status · HR document checklist & verification · HR-owned joining/probation/confirmation
- **Accounts:** credit/debit notes · TDS on receipts (194J) · GSTR-1-ready export · per-entity FY numbering · period lock
- **Assets:** movement history · exit clearance block · purchases → receive · Excel import
- **Administration:** server-side permission enforcement · audit of admin actions · last-admin guard · session revocation
- **Dashboards:** partner view (clients' hours/WIP/AR) · HR view (on leave today, joiners/exits, probation due)
- **Reports:** rate card → client realisation, WIP/unbilled, AR ageing by partner · attrition

## UI/UX

Strong base (design system, en-IN formats, mobile card tables, inline validation). To reach professional grade: darken hint text (fails contrast), keyboard-accessible table rows, error states on the dashboard, dark-mode overlay, focus trap in dialogs, toasts not covering mobile dialog buttons, 40px tap targets, one consistent naming/casing, remove developer wording ("current server…"), real 404 page instead of "module being moved".

## Plan

1. **Security & access** — all Critical/High access items above, error handler, rate limit, session revocation.
2. **Money & data integrity** — Accounts ledger/numbering/state machine/auto-match/credit notes/TDS; reimbursement & asset state guards; report maths.
3. **Broken workflows** — team assignment, invite link, help-desk assignment, timesheet export, document download, leave cancel/holiday rules, attendance corrections.
4. **Must-have features** module by module (list above).
5. **UI/UX polish** — the list above, then a full role-by-role re-test.
