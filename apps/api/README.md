# ASA Portal — Phase 3 API (`@asa-portal/api`)

Fastify 5 + TypeScript + Prisma + Socket.IO backend built on top of the existing PostgreSQL schema (`prisma/schema.prisma`, 56 models) with zero destructive schema migrations (`synchronize: false`).

## Architecture & Route Modules (`src/modules/`)

1. **`auth.routes.ts`**:
   - `POST /api/auth/login` (strict `bcrypt.compare` only — fixes `S3`; supports all Accounts roles — fixes `AC14`)
   - `GET /api/auth/me`, `POST /api/auth/refresh` (prevents `STALE_TOKEN` check-in/out errors — fixes `C3, C7`)
   - `POST /api/auth/register` (public self-registration disabled — fixes `M2`)
   - `POST /api/auth/change-password`, `POST /api/auth/forgot-password`, `GET /api/auth/validate-reset-token`, `POST /api/auth/reset-password`
   - `GET /api/auth/validate-registration-token`, `POST /api/auth/complete-registration` (saves `profileImage` to `/uploads/profile/` — fixes `RG2`)
2. **`dashboard.routes.ts`**:
   - `GET /api/dashboard/combined` (real figures, no fabricated 21-day leave balance — fixes `C4, C5`)
   - `GET /api/search`, `GET /api/chat`, `POST /api/chat`
   - `GET /api/events`, `POST /api/events`, `DELETE /api/events/:id` (role-guarded — fixes `E8`)
   - `GET /api/notifications`, `PATCH /api/notifications/read-all`, `PATCH /api/notifications/:id`, `POST /api/notifications/bulk-update`, `DELETE /api/notifications/:id`, `POST /api/notifications/bulk-delete`, `POST /api/notifications/approve-employee` (scoped — fixes `E6, E7`)
3. **`employees.routes.ts`**:
   - `GET /api/employees`, `GET /api/employees/team` (`M1`), `GET /api/employees/pending-approvals`, `GET /api/employees/:id` (`P2, P3`)
   - `POST /api/employees` (`M3, M11, M12`), `PUT /api/employees/:id` (safe partial update that never wipes `EmployeeManager`/`EmployeePartner` reporting lines or bank/emergency fields — fixes `U1, AD4`)
   - `PATCH /api/employees/:id/toggle-status`, `POST /api/employees/approve-employee/:id`, `POST /api/employees/reject-employee/:id`, `POST /api/employees/resend-registration/:id` (`M4`)
   - `POST /api/employees/profile/photo/:employeeId` (`P1`), `GET/POST/DELETE /api/employees/:employeeId/documents` (`P4`)
4. **`management.routes.ts`**:
   - Full CRUD for `/api/clients`, `/api/projects`, and `/api/jobs` with collision-safe codes (`M11`), partial updates that preserve existing fields (`M5, M6`), and referential integrity checks before deletion (`M7`).
5. **`timelogs.routes.ts`**:
   - `GET /api/timelogs/my`, `GET /api/timelogs/team`, `GET /api/timelogs/reports` (`RP1–RP5`)
   - `POST /api/timelogs`, `PUT /api/timelogs/:id`, `DELETE /api/timelogs/:id` (`T1–T5`)
   - `PATCH /api/timelogs/:id/submit`, `POST /api/timelogs/submit-bulk` (`T8`)
   - `POST /api/timelogs/:id/approve`, `POST /api/timelogs/:id/reject`, `POST /api/timelogs/bulk-approve`, `POST /api/timelogs/bulk-reject` (`T6, T7`)
   - `GET /api/timelogs/template`, `POST /api/timelogs/import`
6. **`compliance.routes.ts`**:
   - `GET /api/compliance/dashboard`, `POST /api/compliance/trigger-reminder/:id`, `POST /api/compliance/escalate/:id`, `GET /api/reports/overview` (`C1–C3, T14, L7, RP6–RP7`)
7. **`attendance.routes.ts`**:
   - `GET /api/attendance/today`, `POST /api/attendance/check-in` (`/login`), `POST /api/attendance/logout` (`/check-out` — updates the active day's attendance row instead of creating a phantom previous-day row — fixes `C1, C2`)
   - `GET /api/attendance/weekly-pulse`, `GET /api/attendance/all`, `GET /api/attendance/monthly`, `POST /api/attendance/force-checkout`, `PUT /api/attendance/update` (`A1–A11, S4`)
8. **`leaves.routes.ts`**:
   - `GET /api/leaves`, `GET /api/leaves/balance`, `GET /api/leaves/negative-balances`, `POST /api/leaves`, `PATCH /api/leaves/:id`, `DELETE /api/leaves/:id`, `PUT /api/leaves/:id`, `POST /api/leaves/adjust` (`L1–L6`)
9. **`reimbursements.routes.ts`**:
   - `GET /api/reimbursements`, `GET /api/reimbursements/team-approvals`, `POST /api/reimbursements` (saves multipart receipts to `ReimbursementAttachment` — fixes `U3`), `PATCH/PUT /api/reimbursements/:id` (supports editing `PENDING_MANAGER` and `SENT_BACK` claims — fixes `R4`), `DELETE /api/reimbursements/:id`, `PATCH /:id/approve`, `PATCH /:id/reject`, `PATCH /:id/send-back`, `PATCH /:id/mark-as-paid` (`U2, R1`)
10. **`assets.routes.ts`**:
    - `/api/assets/*` (inventory, allocations, my-allocations, assign, return, transfer, maintenance, vendors, masters) and `/api/asset-requests/*` (`AS1–AS10`)
11. **`helpdesk.routes.ts`**:
    - `/api/tickets/*` (multipart uploads with safe extension filter — fixes `H6`) and `/api/helpdesk/categories/*` (`H1–H10`)
12. **`accounts.routes.ts` & `admin.routes.ts` & `system.routes.ts`**:
    - `/api/accounts/invoices/*`, `/api/accounts/receipts` (transactional FIFO allocation excluding `DRAFT` and cross-currency invoices — fixes `AC6`), `/api/accounts/entities` (`AC12`), `/api/accounts/audit-log` (parameterized Prisma `AuditTrail` query — fixes `S6, AC1, AD8`)
    - `/api/masters/:kind` (`AD11, AC15`), `/api/admin/*` (`AD1–AD3`), `/api/essl/*` (`AD7`), `/api/email/*` (`E1–E4, AD9`), `/api/system/*` (`AD6, AD12`), and `/uploads/*`.

## Running Locally

```bash
npm run typecheck
npm run build
npm start
```
