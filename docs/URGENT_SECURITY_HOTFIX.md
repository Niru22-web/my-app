# URGENT — security issues in the LIVE portal (timesheet.asaind.co.in)

Found while mapping the current backend for the redesign. These affect production **today**, independently of
the new ASA Portal. Nothing here has been applied to the live server — someone with server access needs to act.

## 1. Stop-gap at nginx (minutes, no code change)

Add inside the `server { … listen 443 … }` block of `timesheet_nginx.conf`, **above** the generic `location /api/`:

```nginx
# Unauthenticated dump of every employee (name, email, role, status). Not used by any screen.
location = /api/employees/team { return 403; }

# Public self-registration that accepts any role (incl. Admin) and creates an ACTIVE account.
# Side effect: the public /register page stops working. Staff are onboarded by invitation instead.
location = /api/auth/register { return 403; }

# Unauthenticated password check + check-in, no rate limit, no caller in the app.
location = /api/attendance/login { return 403; }

# UNAUTHENTICATED open mail relay: anyone can send any email from the company Outlook account.
# Side effect: the Accounts "Generate & Send invoice" email stops until the backend adds auth to this route.
location = /api/email/send-email { return 403; }
```

Then `sudo nginx -t && sudo systemctl reload nginx`.

Also remove the `@fallback` rule that serves **one employee's bank statement / photo** whenever any upload is missing.

## 2. Small backend patches (needs a deploy of `timesheet-backend`)

| Risk | File | Minimal fix |
|---|---|---|
| Any user resets **anyone’s** password (incl. Admin) to a password written in the source | `employee.controller.ts:1645-1653` (`resend-registration`, `type:'old'`) | Delete the `type === 'old'` branch. Always send a fresh registration link. |
| Any logged-in user can **create an Admin** (`isOldEmployee:true` → active with known password) | `employee.routes.ts:218` `POST /api/employees` | Add `checkManagerRole` (or admin/HR only) and remove the hard-coded temporary password path. |
| Any logged-in user can **hard-delete any employee** and all their timesheets/leave/claims | `employee.routes.ts:222` `DELETE /api/employees/:id` | Restrict to Admin; better, disable and use “inactive”. |
| Saving **My Profile** wipes the person’s managers/partners and bank details; any user can edit any employee incl. `role` | `employee.controller.ts:279-480` `PUT /api/employees/:id` | Allow only self (profile fields only) or Admin/HR; don’t touch hierarchy/bank fields that aren’t in the request. |
| Any user can pay / reject / bulk-approve any expense claim | `reimbursement.controller.ts:560-768` | Add role + stage checks (finance roles for mark-as-paid). |
| Any user can read/edit the whole firm’s attendance | `attendance.controller.ts` `/all`, `/report`, `/monthly`, `/update`, `/force-checkout` | Restrict to Admin/HR/IT (+ managers for their team). |
| Password hashes returned to the browser | `GET /employees`, `/employees/by-email`, `/attendance/today`, `/attendance/report`, `/assets/reports`, `/accounts/invoices`, `/accounts/approval-queue`, `/accounts/transactions`, leave/claim approve responses | Use `select` to exclude `password`. |
| **SQL injection** in accounts audit logging and the audit-log search | `accounts.routes.ts:41-59` (`logAudit`, `$executeRawUnsafe`), `:1558-1577` (`GET /accounts/audit-log`) | Use Prisma `create` / parameterised `$queryRaw` tagged templates. |
| Managers/Partners can **grant themselves (or anyone) any permission**, incl. Administration | `userPermissions.routes.ts:20-29` | Restrict `POST /admin/user-permissions` and `/role-permissions` to Admin. |
| Any user can take over / delete the company **Outlook sender**; OAuth tokens returned to the browser | `emailOAuthRoutes.ts:8`, `email-connector.routes.ts:24,27`, `email.controller.ts:663` | Admin-only connect/disconnect, signed `state`, never return tokens. |
| Help-desk tickets readable/reassignable by anyone; uploads of any type served publicly | `ticket.controller.ts:10-30, 527-589`; `ticket.routes.ts:25-28` | Scope reads/writes; whitelist file types; serve uploads behind auth. |
| Dev-mode admin bypass and hard-coded JWT fallback secret | `auth.middleware.ts:15-29`, `config/jwt.ts:4` | Remove the bypass; fail to start if `JWT_SECRET` is missing. Confirm production `NODE_ENV=production`. |

## 3. Data clean-up to check on the live database

- Employees with **no manager/partner links** (likely wiped by Profile saves) — re-link via HR.
- Employee profiles with **DOB = 2000-01-01** and `pan = 'Not provided'` — auto-created placeholders (photo upload), not real data.
- **Duplicate attendance rows** dated one day before a real day with no sessions (created on every check-out).
- Clients with blank address/GSTIN/PAN after a status toggle.

The full list of backend defects is in `docs/BACKEND_FINDINGS.md`. The new backend (Phase 3) fixes all of them.
