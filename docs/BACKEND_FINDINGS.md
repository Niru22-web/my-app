# Legacy backend findings — to fix in `apps/api` (Phase 3)

Found while building the new frontend against `legacy/timesheet-backend`. The new API must keep endpoint
paths and response shapes, but these behaviours should be corrected (with a compatible response).

## Security
| # | Where | Issue |
|---|---|---|
| S1 | `middleware/auth.middleware.ts:15-23` | `NODE_ENV=development` + no token ⇒ request runs as a hard-coded Admin. |
| S2 | `config/jwt.ts:4`, `auth.middleware.ts:29` | Hard-coded fallback JWT secret when `JWT_SECRET` is missing. |
| S3 | `modules/auth/auth.controller.ts:96` | Login accepts a plaintext password match in addition to bcrypt. |
| S4 | `attendance.controller.ts` `GET /attendance/today` | Returns the full Employee row **including the password hash** in `data.user`. |
| S5 | `services/socket.service.ts` | Socket.IO has no auth; any client can `join_user_room` for any user id. |
| S6 | `modules/accounts/accounts.routes.ts:41-59` | `logAudit` builds SQL by string interpolation (injection risk). |
| S7 | production nginx `@fallback` | Missing uploads are rewritten to one specific employee's bank statement / photo. |
| S8 | `auth.middleware.ts` | Accepts JWT via `?token=` query string (leaks into logs/history). |

## Correctness
| # | Where | Issue |
|---|---|---|
| C1 | `attendance.controller.ts:347` check-out | **Root cause confirmed:** check-out computes the day key with server-local `setHours(0,0,0,0)` and upserts a **second "phantom" attendance row dated the previous day** (in/out copied, no sessions). The real row keeps `check_out_time = null`. Every check-out therefore creates a duplicate day ⇒ `presentDays` double-counts, monthly shows extra days. New UI merges these; backend must fix and a one-off cleanup must delete existing phantom rows. |
| C2 | attendance check-out | Real day row never gets `check_out_time` (consequence of C1). |
| C3 | check-in / check-out | `STALE_TOKEN`: requires JWT issued < 1 h ago while tokens live 2 days. Decide policy explicitly. |
| C4 | `dashboard.controller.ts` events | `events[].date` formatted as `"Oct 9"` (en-US) — return ISO dates instead. |
| C5 | `GET /dashboard/combined` leaves | With no `LeaveBalance` row, returns a fabricated `total: 21`. Return `null`. |
| C6 | accounts guard | Checks `req.user.hasAccountsAccess`, never present in the JWT ⇒ HR always 403. |
| C7 | `/auth/refresh` | Called by legacy frontend but not implemented. |
| C8 | `prisma/migrations` | Migrations cannot rebuild the schema from scratch (20260618 references a table no migration creates). Live DB is the source of truth. |
| C9 | ticket `new_notification` socket payload | Partial object without `id`. |

## ⚠ URGENT — affects the LIVE portal today
| # | Where | Issue |
|---|---|---|
| U1 | `PUT /api/employees/:id` (`employee.controller.ts:279-480`, route has `authenticate` only) | **Saving My Profile wipes the employee's reporting hierarchy** (`managers`/`partners` deleteMany, `reportingManagerIds`, `subManagerId`… set empty) **and nulls bank/emergency fields** not in the form. Their later leave/claims notify and route to nobody. Also **no ownership/role check** — any user can change any employee incl. `role`, `isApproved`, `hasAccountsAccess` (privilege escalation). Check the live DB for employees with no `EmployeeManager` rows. |
| U2 | `reimbursement.controller.ts:560-768` | reject, send-back, bulk-approve, bulk-reject, **mark-as-paid** have no authorisation — any user can pay or reject any claim. bulk-approve lets an Employee move claims to MANAGER_APPROVED. |
| U3 | `reimbursement.controller.ts:264-429` | Uploaded receipts are **discarded** (`req.files` never read; `ReimbursementAttachment` empty). Users believe receipts were attached. |

## Management (clients / projects / jobs / employees)
| # | Where | Issue |
|---|---|---|
| M1 | `employee.routes.ts:148-210` | **`GET /api/employees/team` has no auth** — anyone on the internet gets every employee. |
| M2 | `auth.routes.ts:11` | **`POST /api/auth/register` is public** and accepts any `role`, creating an active account. |
| M3 | `employee.routes.ts:218,222` | Any logged-in user can create employees (incl. Admin, with a known temp password) or hard-delete any employee and their data (non-transactional). |
| M4 | `employee.controller.ts:1645-1653` | `resend-registration` `type:'old'` resets anyone’s password to a hard-coded value. Old registration tokens never invalidated. |
| M5 | `client.service.ts:342-352` via `toggle-status` | **Toggling a client wipes alias, address, PIN, state, country, GSTIN, PAN.** New UI uses PUT with the full record. |
| M6 | project/job `toggle-status`, PUT | `endDate` set to null whenever not sent; toggle loses Completed/In-Discussion. New UI sends full records. |
| M7 | client/project/job DELETE | Hard cascades that delete **timelogs (incl. approved)** and reimbursements; fail with P2003 on accounting links. New UI only offers delete when nothing is logged. |
| M8 | job/project update | Moving a job/project doesn’t recompute `combinedId` or timelog `clientId/projectId`. New UI locks client/project on edit. |
| M9 | `?all=true`, employee `search` | Disables role scoping for anyone; search `OR` overwrites the scope `OR`. |
| M10 | create responses | Project/job create include full Employee rows (password hash). |
| M11 | `client.service.ts:180-206` | `CL` id from string sort (breaks after CL9999), racy; project/job ids throw on collision instead of retrying. |
| M12 | approve/reject employee | Not scoped; approve doesn’t set `isApproved/approvedAt/By`; reject reason not stored; toggle turns pending/rejected straight into active. |
| M13 | module permissions | `checkPermission` never applied to these routes — server only checks roles. |

## Profile / employee records
| # | Where | Issue |
|---|---|---|
| P1 | `POST /employees/profile-photo` (`employeeProfile.controller.ts:717-733`) | If no profile row exists it **creates one with fabricated values**: DOB 2000-01-01, **date of joining = upload time**, gender "Other", "Single", "Not provided" PAN/Aadhaar/addresses. These look like real data in reports. New UI hides them; backend must stop writing them and a cleanup should null them. |
| P2 | `GET /employees/by-email` (:831) | Any user can fetch any employee by email; response spreads the full row **incl. password hash**. |
| P3 | `GET /employees/:id` (`employee.controller.ts:1179`) | `authenticate` only — any user can read any colleague's PAN, Aadhaar, bank account, salary, addresses. |
| P4 | `GET /employees/:employeeId/documents`, `/documents/:id/download` | No ownership check visible — any user can list/download others' identity documents. |

## Leave (`modules/leave`)
| # | Where | Issue |
|---|---|---|
| L1 | `leave.controller.ts:121-125, 338-484, 613-695` | Any approver role can list/read balance of any employee, approve any leave (no hierarchy, **self-approval possible**), adjust any balance (no audit of who). |
| L2 | create | Trusts client `totalDays` (0/negative accepted; negative inflates balance); no overlap check; balance not enforced; `LV-` id = count+1 (race). |
| L3 | create :280 | Auto-approve check is case-sensitive (`'Admin'`), lowercase roles not auto-approved. |
| L4 | approve | `used` transaction dated at approval, not leave date (wrong FY bucket). FY bounds in server-local time (`financialYearStart` returned as `YYYY-03-31`). |
| L5 | PUT status | Any value other than `approved` rejects; no rejection reason; response includes full Employee row (password hash). |
| L6 | model | `LeaveBalance` table never populated (default 21) but used by Reports; real source is `LeaveTransaction` (16 days/yr accrual). No leave types table, no holidays, no working-day logic, no carry-forward. |
| L7 | compliance | `auto_approved` leave not treated as leave. |
| L8 | auth | Inline middleware returns **400** for invalid token (not 401) and has a hard-coded fallback secret. |

## Reimbursements (`modules/reimbursement`)
| # | Where | Issue |
|---|---|---|
| R1 | `:466, 471` | Any MANAGER/PARTNER/ADMIN/OWNER can approve any claim incl. their own; partner/admin skip manager stage. |
| R2 | export / charts / logs | Org-wide data to any user. `status=all` export returns 0 rows. |
| R3 | `:110-206`, `:1044-1096` | Search `OR` overwrites the scope `OR` — managers see other teams' claims when searching. (New UI searches client-side.) |
| R4 | update | No status guard (approved/paid editable & deletable); SENT_BACK can never be resubmitted. |
| R5 | create | Only first manager/partner stored on claim; other managers/sub-managers can't see it; nobody notified at final stage if no partner; accountants never notified. |
| R6 | bulk-upload | No role guard; unknown email creates claim for the uploader; column names don't match UI instructions. |
| R7 | notifications | `user.firstName` not in JWT ⇒ "undefined submitted…"; links to `/approvals/*` (now redirected by the new UI). No emails sent. |
| R8 | `/uploads` | Served without authentication (receipts, employee documents). |

## Attendance module (`modules/attendance`)
| # | Where | Issue |
|---|---|---|
| A1 | `/all` (:684), `/report` (:741), `/monthly` (:835) | **Security:** no role/ownership check — any user can read the whole firm's attendance. (New UI scopes managers/partners to their reports client-side; the API must enforce it.) |
| A2 | `/force-checkout` (:1054), `PUT /update` (:929) | **Security:** no role check — any user can alter anyone's times. New UI shows these only to Admin/Owner/HR/IT. |
| A3 | `/today`, `/all`, `/report`, `/monthly` | Return the full Employee row **including password hash**. |
| A4 | `POST /attendance/login` | Unauthenticated password check + check-in, no rate limit, no caller. Remove. |
| A5 | cron `cron.service.ts:88-172` | Only closes days whose row has null checkout (misses second sessions); closes at 18:30 even if check-in was later (negative/zero durations); writes `'INCOMPLETE'` upper-case; notification uses employee code instead of uuid. |
| A6 | `/report` | `netWorkHours` subtracts breaks twice. |
| A7 | `/monthly` | `attendanceRate` = NaN with no rows; absent days never counted; month bounds in server-local time. |
| A8 | `/update` | `total_hours` only recomputed when both times sent; first session duration not recomputed on new check-in time. |
| A9 | check-in body | `attendance_source` taken from the client (spoofable). |
| A10 | `/essl/machines` | Returns `deviceKey`/`apiKey` to the browser. ESSL device sync is **simulated** — no real device protocol. |
| A11 | model | No holiday model and no link from attendance to approved leave; Late / Half-day are never computed. |

## Timesheet module (`modules/timelog`)
| # | Where | Issue |
|---|---|---|
| T1 | `timelog.service.ts:12-16,191-194` | **Security:** `GET /timelogs/my?employeeId=<uuid>` lets any user read another user's timelogs (also `/timelogs` employee branch and `/export`). |
| T2 | `timelog.service.ts:455-457,592-594` | Any Manager/Partner/Owner can edit or delete **any** timelog firm-wide (no team check). Delete has no status guard — approved time can be deleted. Editing an approved row keeps it approved. |
| T3 | `submitTimelog` (`service:935`) | No status precondition (can re-submit approved rows); doesn't clear `rejectionReason/rejectedBy/rejectedAt`. |
| T4 | `service:462` | Employees can't edit a *returned* entry — only resubmit unchanged or delete. Should allow edit of `rejected` and reset it to draft. (New UI shows Resubmit/Delete only for now.) |
| T5 | create (`service:361`) | Work date stored as UTC midnight and compared to `now` — rejects today's date for UTC−x users. |
| T6 | `service:366-370` | `weekStart` computed in server-local time; server TZ never set. |
| T7 | import (`controller:657,661,706`) | On an IST server, imported dates shift one day back (09-10-2026 stored as 2026-10-08). |
| T8 | `GET /timelogs/my` | Ignores `status` filter (new UI filters client-side). Export ignores status too. |
| T9 | `GET /employees` (`employee.controller.ts:893-911`) | Returns full rows **including password hashes**. |
| T10 | export (`controller:352`) | "Created Date" column contains the work date; Status and Billable not exported. |
| T11 | import | Privileged roles can import time for any employee (no team check); "Client" column ignored. |
| T12 | `PUT /timelogs/:id` | Passes `req.body` straight to Prisma — unknown keys cause 400. Validate/whitelist. |
| T13 | create | No `JobUser` assignment check on manual create (only on import); duplicate (employee, date, job) only checked on import. |
| T14 | `compliance.routes.ts` | No role guard on trigger-reminder / escalate / add-exception; `employeeId` filter bypasses scoping. |
| T15 | approve/reject responses | No approver/rejector names — UI can't show who acted. Include them. |
| T16 | `timelog-weekly.service.ts` | Unused weekly endpoints are broken (weekStart not zeroed, `'non-billable'` typo, own PrismaClient). Remove or fix. |

## Help Desk (`modules/helpdesk`)
| # | Where | Issue |
|---|---|---|
| H1 | `ticket.controller.ts:10-30` | `GET /tickets/:id` unscoped — any user reads any ticket, thread and attachments. |
| H2 | `ticket.controller.ts:527-589` | `POST /tickets/:id/history`: any user can comment on / **reassign** any ticket; `action` is free text (forged "Resolved"/"Escalate" rows). |
| H3 | `ticket.controller.ts:198,450-484` | Any raiser can choose any assignee on create, or reassign while returning. |
| H4 | ticket create/PATCH responses | Full Employee rows (password hash) in `createdBy` / `performer`. |
| H5 | support check `role.includes('it')` | Grants support powers to "Auditor", "Recruiter", "Unit_Head"…; agent lists also match departments containing "it" ("Audit", "Litigation"). New UI uses Admin / IT / *support* only. |
| H6 | `ticket.routes.ts:25-28`, `/uploads` | Attachments: no type filter (HTML/SVG ⇒ stored XSS on app origin), served publicly without auth. New UI restricts types client-side; server must enforce. |
| H7 | routing vs scoping | Tickets auto-routed to **HR/Finance/Admin** people, but those roles aren’t “support” — they can’t see the tickets assigned to them (`GET /tickets` returns own only) or change status. Routing to non-IT teams is effectively broken. |
| H8 | `helpdeskMail.service.ts:288` | `(global as any).prisma` undefined — assignee/status update emails never send. Escalation email never sent; no SLA breach job. |
| H9 | PATCH status | `In Progress` without assignee steals the ticket for the caller; `Open` silently unassigns; statuses unvalidated. New UI avoids both. |
| H10 | ticket number | `TKT-<max+1>` non-atomic; concurrent creates collide. Uploaded files orphaned on errors. |

## Inbox / Email / Calendar / Compliance
| # | Where | Issue |
|---|---|---|
| E1 | `email.routes.ts:94` | **`POST /api/email/send-email` has no auth — open mail relay from the company Outlook account.** |
| E2 | `emailOAuthRoutes.ts:8`, callbacks | Any user (or attacker with any employee code as `state`) can replace the global Outlook sender. |
| E3 | `GET /email/connections`, `/email/email-configuration` | Return Outlook/Gmail access & refresh tokens to any authenticated user. |
| E4 | `DELETE /email/disconnect/outlook` | Any user can disconnect the global sender. |
| E5 | `GET /employees?all=true` | Calendar loads the full directory (PII incl. DOB) just to draw birthdays. |
| C1 | `compliance.service.ts:315,341-353` | "Add exception" is overwritten on the next dashboard load; reason never stored. GET has write side-effects. |
| C2 | `compliance.repository.ts:60-61` | `?employeeId=` replaces self-scope — anyone reads anyone's compliance. Activity feed company-wide for all. |
| C3 | reminder/escalate (`compliance.service.ts:784-822`) | Return HTTP 200 with `success:false` on not-found. Mail failures are swallowed: the API answers "Reminder sent to …" and logs ReminderHistory even when SMTP isn’t configured or sending fails, so the UI can’t tell. |
| E6 | `notification.controller.ts` `GET /notifications` | `snoozedUntil` is stored but never applied — snoozed items still come back (and count as unread in the bell). New UI filters them client-side. |
| E7 | `POST /notifications/approve-employee` | Activates **any** employee id for any manager/partner — not tied to a notification the caller received or to their team. |
| E8 | `event.controller.ts` | No update endpoint; `role.includes('manager')` lets every *_manager accounts role edit the firm calendar. Holidays aren't used server-side for leave — the client now excludes them from `totalDays`, but the server trusts whatever `totalDays` it's sent (L-series). |
| E9 | `POST /notifications` | Any signed-in user can create a notification for **any** user with any message and `actionUrl` (phishing vector). New UI only follows in-app relative links. Should be internal-only. |
