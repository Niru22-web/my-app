# Feature Parity — Old Portal vs New ASA Portal

**Audit date:** 13 Oct 2026 · **Compared:** old `timesheet-backend` + `timesheet-frontend` (Express/React) vs `apps/api` + `apps/web` (Fastify/Next.js)

Status key: ⬜ not started · 🟨 in progress · ✅ done · ➖ dropped on purpose

Old backend ≈ 363 endpoints, new API ≈ 205. All main screens exist in the new portal; the gaps below are features behind them.

---

## 🔴 Go-live blockers

| # | Gap | Old behaviour | New status |
|---|---|---|---|
| B1 | **Background jobs** | node-cron: birthday notifications (09:00), auto check-out (23:59), compliance — daily missing-timesheet (Mon–Fri 09:00), Thu 14:00 <32h warning, Fri 18:00 <40h critical, Mon 10:00 escalation; ESSL sync every 5 min | ⬜ No scheduler in `apps/api` |
| B2 | **Real email sending** | SMTP + Microsoft 365 / Google OAuth; send-from-template; Save & Send invoices | ⬜ Test email only logs a row; `/email/connect` stores settings, no OAuth |
| B3 | **ESSL biometric sync** | Manual "Sync now", auto-sync, live punch feed | ⬜ `test-connection` returns a fixed "Online" |
| B4 | Profile photo upload | `POST /employees/profile-photo` | ✅ Fixed 13 Oct |
| B5 | Asset / allocation Excel export | `GET /assets/export`, `/assets/allocations/export` | ✅ Fixed 13 Oct (admin roles only) |

## 🟠 Missing features

### Timesheet
- ⬜ Weekly entry flow (`/weekly`, submit week, approve week, submission status)
- ⬜ Timesheet export; missing-timesheets report
- ⬜ Dropdowns filtered to clients/projects/jobs the user is assigned to (`/accessible/*`)

### Management (Employees, Clients, Projects, Jobs)
- ⬜ Bulk Excel import + template download + export (employees, clients, projects, jobs)
- ⬜ Project attachments (upload/list/delete)
- ⬜ Activate/deactivate toggle; search; jobs by project/client
- ⬜ Partner and manager pickers (`/partners`, `/managers-by-partner`); secure document download

### Dashboard & Reports
- ⬜ Role-specific dashboards (admin/HR/manager/partner/IT/accountant), trends, exports — now one combined view
- ⬜ Custom report builder (`/reports/query`, options, export)
- ⬜ Activity feeds (`/activity/recent`, `/activity/my`)

### Attendance
- ⬜ Attendance report (`/attendance/report`, old `/attendance/report/:employeeId/:date` page)
- ⬜ Personal history / weekly views

### Reimbursements
- ⬜ Bulk approve / reject, bulk upload, export
- ⬜ KPI cards and charts; reimbursement audit log

### Compliance
- ⬜ Exempt an employee (`/add-exception`), manager summary, activity feed

### Sign-in
- ⬜ Microsoft / Outlook single sign-on
- ➖ Public sign-up (removed on purpose — invite only)

### Accounts & Finance
- ⬜ Approval queue (invoices + reimbursements by authority tier)
- ⬜ Invoices: Save & Send by email, Duplicate, Approve, manual edits on print, template designer
- ⬜ Authorised signatory + template/TDS settings
- ⬜ P&L report (expense categories, net operating profit, hours per client)
- ⬜ Payments-out register
- ⬜ Dashboard cards: bank reconciliation, GST liability, payables, monthly revenue
- ⬜ Move dashboard / finance / GST totals to the server (currently summed in the browser)
- ⬜ Remove outdated placeholder text in `accounts/[...rest]`

### Asset Management
- ⬜ Excel import (assets, allocations) with templates
- ⬜ Inventory tracking with barcode/QR label printing
- ⬜ Reports generator (preview + Excel)
- ⬜ Asset tickets; assets-per-employee view; employee self-registered personal assets
- ⬜ Delete asset / allocation / maintenance record; maintenance reminders
- ⬜ Vendor asset & purchase history; status masters
- ⬜ Move asset dashboard totals to the server
- **From the ASA Asset Lifecycle app** (`asa-laptop-lifecycle`, Oct 2026) — features to merge in:
  - ⬜ Purchase invoices with multiple line items → "Receive" creates asset records
  - ⬜ QC step (`In QC` → Pass QC → `In stock`)
  - ⬜ Statuses: In QC / In stock / Allocated / Under repair / Retired
  - ⬜ Asset tag format `ASA/<FY>/<n>` (FY April–March)
  - ⬜ Movements log (receipt, QC, allocation, return, repair, reassign)
  - ⬜ Categories Laptop / Headphones / Mobile / Others
  - ⬜ Import its data: 121 laptops, 142 purchase lines, 15 vendors, 234 movements

### Help Desk
- ⬜ Date-range presets (Today / This week / This month / Custom) and multi-assignee filter
- ⬜ Category SLA hours + auto-assign settings in the categories page

## ✅ At parity
Leave (now with full leave rules — see Leave Tracker → Leave policy) · User permissions · Masters · Calendar events · Global search · Team chat · System/storage

---

## Data migration from Zoho People + asset register — ✅ loaded into LOCAL database 13 Oct 2026
Script: `apps/api/scripts/import-zoho.cjs` (re-runnable; refuses non-local databases without `--allow-remote`).

| Source | Rows | Imported |
|---|---|---|
| `Employee View.xlsx` | 121 | 120 employees (Zoho Admin system user skipped), active + approved, **no passwords**; 107 profiles; reporting manager + partner (Zoho "Department" = partner) |
| `Clients.xlsx` | 170 | 170 clients |
| `Projects.xlsx` | 60 | 52 projects (only those with jobs) + 578 team links |
| `Jobs.xlsx` | 618 | 443 jobs (only those with a project; 17 same-name rows merged) |
| `Holiday_01-Mar-2026_28-Feb-2027.xlsx` | 12 | 14 calendar days (Diwali = 3) |
| `asa-laptop-lifecycle` seed | 121 assets | 121 laptops, 15 vendors, 102 allocations |
| Timesheet entries | — | Not yet received |

**Needs a decision / clean-up**
- 13 employees have no date of birth or joining date in Zoho → no profile yet
- 7 laptops' holders not matched (imported as Available): ASA/2023-24/1016 Shilpa Jain, 1026 Aakash Vaishya (≈ Akash Vaishya), 1034 Tanish Mandavia, 1056 Bhavini Pandya, ASA/2024-25/1074 Gouransh Jain, ASA/2026-27/1118 Prajakata Sarang (≈ Prajakta Sarang), 1158 Pratham Kacchara
- Project members 1073, 1119, 1151 are not in the employee export (likely exited)
- "Welcorre Adventures" has no client in Zoho → skipped; duplicate "Admin and Management" without client → skipped
- 49 asset purchase lines have no matching asset → wait for the Purchases feature
- Roles come from Zoho Role on first import: 5 Zoho Admins became portal **Admins** (full access) — to confirm. Partner-group heads (incl. Ashutosh Jethlia, Shreya Dave) are set to **Partner**. Re-runs never change an existing employee's role.
