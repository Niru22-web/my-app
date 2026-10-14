# Ashish Shah & Associates (ASA) Portal — Project Development & Completion Report

**Date:** October 2026  
**Status:** Phases 0, 1, 2, and 3 Complete · Production-Ready Monorepo  
**Codebases:** `frontend` (Next.js 16 Frontend) · `backend` (Fastify 5 Backend) · `legacy/timesheet-backend` (Patched Express Backend)

---

## Executive Summary

The ASA Practice Portal has been completely modernized from the legacy timesheet system into a unified, enterprise-grade practice management platform. All core modules across employee self-service, management, operations, IT help desk, asset tracking, administration, and accounts & finance are fully developed, strictly typed, secured against identified vulnerabilities, and verified against the production PostgreSQL schema.

---

## 1. Monorepo Architecture & Core Infrastructure

| Component | Technology | Description & Achievements |
|---|---|---|
| **Frontend App** | Next.js 16, React 19, Tailwind CSS | Enterprise responsive UI matching firm branding (`#003887` ASA Blue, grey, white), dark/light mode toggle, TanStack Query v5 state management, zero mocked/sample data. |
| **New API Server** | Fastify 5, TypeScript, Prisma ORM, Socket.IO | High-throughput Phase 3 backend serving `/api/*` endpoints, streaming multipart file uploads, preSerialization password-stripping hooks, and real-time WebSockets. |
| **Legacy API Server** | Express 4, TypeScript, Prisma ORM | Fully audited and patched to ensure 100% backwards-compatibility and emergency fallback capability. |
| **Database** | PostgreSQL 16 (83 Prisma Models) | Shared transactional database. All 33 newly referenced models and relations verified with zero missing schema tables. |
| **Monorepo Tooling** | `package.json`, `scripts/dev.mjs` | Root script runner launching both `backend` (`:5000`) and `frontend` (`:3000`) concurrently with colored, prefixed process output and graceful SIGINT handling. |
| **Type & Lint Health** | TypeScript 5.8, ESLint 9 | `tsc --noEmit` and `eslint` pass with **0 errors** across `frontend`, `backend`, and `legacy/timesheet-backend`. |

---

## 2. Security Audits & Vulnerability Fixes (40+ Issues Resolved)

All critical vulnerabilities identified in `docs/BACKEND_FINDINGS.md` and `docs/URGENT_SECURITY_HOTFIX.md` were remediated across both `backend` and `legacy/timesheet-backend`:

1. **Authentication & Authorization Hardening**:
   - Removed unauthenticated development mock-Admin bypass in auth middleware (`S1`).
   - Removed plaintext password comparison fallback; enforced secure `bcrypt.compare` (`S3`).
   - Whitelisted all Accounts roles (`accounts_admin`, `accounts_manager`, `accounts_executive`, `finance_approver`, `ar_manager`, `ap_manager`, `accountant`) in login role checks (`AC14`).
   - Secured `POST /register` with administrative authorization to prevent unauthorized self-registration of active administrative accounts (`M2`).
   - Protected user permission endpoints to prevent users from modifying their own roles or rights (`AD3`).

2. **Data & Password Leak Prevention**:
   - Implemented global `preSerialization` hooks and explicit Prisma projection guards (`SAFE_EMPLOYEE_SELECT`) ensuring password hashes are never serialized in API responses across Employees, Timesheets, Attendance, Leave, Tickets, and Accounts (`S4`, `M10`, `P2`, `A3`, `T9`, `H4`, `AS2`, `AC2`).

3. **Data Integrity & Reporting Line Protection**:
   - Fixed employee profile update bug (`U1`, `AD4`) where saving personal info previously wiped reporting manager and partner hierarchy assignments (`employeeManager`, `employeePartner`).
   - Fixed attendance check-out date mismatch (`C1`, `C2`) where UTC midnight vs local date comparison caused phantom duplicate attendance records.
   - Handled reimbursement file uploads so uploaded receipt attachments are saved and linked to `ReimbursementAttachment` records (`U3`).

4. **Injection & File Safety**:
   - Replaced raw unsafe SQL queries with parameterized Prisma ORM operations in audit logs and financial queries (`S6`, `AC1`, `AD8`).
   - Added strict path traversal containment checks (`path.resolve` and boundary validation) on storage downloads and deletions (`AD6`).
   - Added MIME and file extension filtering on uploads, blocking malicious script types (`.html`, `.svg`, `.exe`, `.ps1`, `.sh`) (`H6`).

---

## 3. Completed Feature Modules (`frontend` + Backend)

### 3.1. Dashboard (`/dashboard`)
- **Real-Time KPIs**: Total active projects, weekly logged hours, leave balances, pending approvals counter across all modules, and expense claim summaries.
- **Visual Analytics**: Weekly attendance breakdown bar chart, upcoming firm calendar events, birthdays this month, and activity audit feed.
- **Live Sync**: Automatic 30-second refetch and WebSocket push updates.

### 3.2. Timesheet Management (`/timesheet`)
- **Weekly Timesheet Grid**: Client → Project → Job hierarchical selector with daily hour entry (Monday–Sunday), billable/non-billable flag, and work descriptions.
- **Submission & Approvals**: One-click week submission with validation against missing details.
- **Team Review**: Managers and partners can review, approve, or reject team submissions with mandatory feedback remarks.

### 3.3. Attendance & Time Tracking (`/attendance`)
- **Web Check-In / Check-Out**: Multi-session daily clocking (supporting lunch breaks and field visits) with geolocation capture and duration calculations.
- **My Attendance**: Interactive monthly calendar with daily hours, punch-in/out times, and presence status indicators.
- **Team & Firm Logs**: Attendance viewer filterable by date, department, and employee for Admin, HR, and Managers.
- **Administrative Correction**: HR/Admin force-checkout and punch correction dialogs for missed check-outs.

### 3.4. My Portal (`/portal/*`)
- **My Profile (`/portal/profile`)**: Personal details, emergency contacts, bank details, address, photo upload, and password change.
- **Leave Management (`/portal/leaves`)**:
  - Leave application with automated calculation deducting only working days (automatically excluding weekends and official firm calendar holidays).
  - Leave balance cards (Privilege, Casual, Sick, etc.) and history log with status indicators.
  - Team Leave Approvals queue for HR, Managers, and Partners.
- **Expense Reimbursements (`/portal/claims`)**:
  - Multi-category claims (Travel, Food, Client Entertainment, Office Supplies, etc.) with receipt attachment upload (PDF/Images).
  - Multi-tier approval workflow (Employee → Manager Approval → Finance Review → Paid).
  - Export claims list to CSV.
- **Reports & Analytics (`/portal/reports`)**:
  - Custom date ranges, client/project filters, billable vs non-billable utilization charts.
  - Time distribution breakdowns across clients, projects, jobs, and individual contributors.
  - Granular CSV export of all timesheet line entries.

### 3.5. Management Master Data (`/management/*`)
- **Employees**:
  - Onboarding invitation flow sending one-time registration tokens.
  - New joiner approval queue for HR and Admin.
  - Employee list with role, designation, department, status toggles, and direct profile inspection.
- **Clients, Projects & Jobs**:
  - Hierarchical creation and editing (Jobs belong to Projects, which belong to Clients).
  - Safety checks preventing accidental deletion of records that have logged timesheet entries.

### 3.6. Help Desk (`/help-desk/*`)
- **Ticket Lifecycle**: Ticket creation with categories, priority (Low, Medium, High, Urgent), and file attachments up to 50 MB.
- **Resolution Workspace**: Chronological activity timeline, threaded replies, SLA timer countdown, and status transitions (Open, In Progress, Resolved, Closed, Reopened).
- **Category & SLA Setup**: Administrative configuration of categories, default assignees, escalation rules, and SLA turnaround hours.

### 3.7. Asset Management (`/admin/asset-management/*` & `/portal/my-assets`)
- **Employee Portal**: View currently allocated equipment with serial numbers, asset tags, and warranty details; submit new hardware/software requests.
- **Inventory Workspace**: Hardware inventory registry with status tracking (Available, Assigned, In Maintenance, Retired, Lost).
- **Asset Allocations**: Handover and take-back actions tracking equipment condition and reassignment history.
- **Maintenance & Vendors**: Maintenance logging with vendor association and cost tracking; vendor directory with GSTIN and contact details.

### 3.8. Compliance & Governance (`/compliance`)
- **Timesheet Compliance Monitor**: Weekly compliance KPI tracking against the 40-hour standard (Monday–Friday).
- **Risk Assessment**: Flags employees with missing days, low hours, or repeated non-compliance.
- **Escalation System**: One-click reminder email dispatch and hierarchical escalation to employee managers and HR.

### 3.9. Inbox & Organization (`/inbox`, `/calendar`)
- **Unified Inbox**: Actionable notification hub with filtering by Unread, Starred, Pinned, High Priority, and Module, plus "Snooze until tomorrow 9 AM" and bulk actions.
- **Firm Calendar**: Monthly visual planner showing official holidays, meetings, firm events, and birthdays, directly feeding into leave deduction logic.

### 3.10. Admin Portal (`/admin-portal/*`)
- **System & Storage (`/admin-portal/system`)**: Real-time database metrics (including Help Desk tickets count), server health, and storage file browser with single-file safe deletion.
- **Masters Configuration (`/admin-portal/masters`)**: Master catalog management for Roles, Designations, Departments, Employment Types, Shifts, and Locations.
- **Users & Access Control (`/admin-portal/user-access`)**: Role-based and custom user-level permission grids covering 19 modules across View, Create, Edit, and Delete actions.
- **Organizational Hierarchy (`/admin-portal/hierarchy`)**: Visual reporting lines tree with warnings for unassigned active personnel, and an edit modal for primary/secondary managers and partners.
- **Biometric Devices (`/admin-portal/biometrics`)**: ESSL device management, IP/port ping connectivity tests, punch-log sync monitoring, and name-based auto-matching of device IDs to employees.
- **Email Infrastructure (`/admin-portal/email-templates`)**:
  - Mailbox connection manager supporting Microsoft 365, Google Workspace, and Custom SMTP with connect/disconnect actions.
  - Template manager with live preview and placeholder verification.
  - Searchable outgoing email delivery log with status, recipient, and timestamp filters.

---

## 4. Accounts & Finance Suite (All 11 Sub-Tabs Completed)

The Accounts & Finance module in `frontend/src/app/(portal)/accounts` and backend APIs was fully built:

| Sub-Tab | Route | Key Capabilities |
|---|---|---|
| **Overview** | `/accounts` | Receivables aging analysis, overdue breakdown, collections vs billings, top debtor list. |
| **Invoices** | `/accounts/invoices` | Create multi-currency tax invoices, SAC code selection, automated GST calculation (CGST/SGST or IGST), draft lifecycle, mark-as-sent locking, and print-ready A4 PDF generation. |
| **Receipts** | `/accounts/receipts` | Record client payments with automatic FIFO allocation against oldest unpaid invoices or manual specific allocation. |
| **Bank & Reconciliation** | `/accounts/banking` | Real CSV bank statement importer with browser preview, manual debit/credit entry, auto-matching against open invoices (transactionally creates `Receipt` + `ReceiptAllocation`), and manual reconciliation modal. |
| **Payroll & Payables** | `/accounts/payables` | Generate monthly employee salary runs (basic, allowances, deductions), mark paid with automated `EMPLOYEE` ledger posting, plus approved expense claims payout queue. |
| **Statements & Ledgers** | `/accounts/client-ledger` | Segmented view toggling **Client statements**, **Employee ledger** (with running balances), and **General ledger**, plus manual journal entry modal. |
| **GST & Tax** | `/accounts/gst-reports` | Monthly, quarterly, and financial year GST return summaries (B2B vs B2C/export) plus Configured GST & TDS tax slab management. |
| **Revenue & Expenses** | `/accounts/revenue-expenses` | Financial year revenue and collections trend, revenue per client, and expense reimbursement payouts by category. |
| **Currencies** | `/accounts/currencies` | Currency catalog (INR, USD, EUR, GBP, AED, SGD, etc.) and historical exchange rate tracker against INR. |
| **Audit Log** | `/accounts/audit-log` | Searchable, paginated finance audit trail capturing every invoice, receipt, reconciliation, payroll, and ledger event. |
| **Billing Entities** | `/accounts/billing-entities` | Master legal entities with PAN and GSTIN cross-validation, bank account details for invoice templates, and invoice prefix configurations. |

---

## 5. Verification & Test Status

- **Prisma Schema Audit**: Verified that all **33 models** referenced across the newly implemented modules are present and fully mapped in `schema.prisma`.
- **Static Analysis**:
  - `backend`: `tsc --noEmit` passed with 0 errors.
  - `legacy/timesheet-backend`: `tsc --noEmit` passed with 0 errors.
  - `frontend`: `tsc --noEmit` passed with 0 errors.
  - `frontend`: `eslint src` passed with 0 errors.
- **Automated Smoke Testing**: Executed against live running server with real database accounts:
  - Verified Health and Ping endpoints.
  - Verified Admin authentication and JWT issuance.
  - Verified protected endpoints return 401 when unauthenticated.
  - Verified that password hashes are not leaked in any endpoint response.
  - Verified record fetching for Employees, Clients, Projects, Jobs, Attendance, Leaves, Notifications, Calendar Events, Invoices, Receipts, Transactions, Payroll, Ledgers, Taxes, Currencies, and Audit Logs.

---

## 6. What's Next (Roadmap)

1. **Background Automation & Worker Testing (Deferred Point 2)**:
   - Configure and test background cron workers: auto-checkout at shift end, weekly compliance reminder emails, ESSL biometric punch polling.
   - Configure production SMTP/OAuth mailbox credentials for live email delivery.
2. **Phase 4: Deployment & Production Hosting**:
   - Create Dockerfiles and container configurations for `backend` and `frontend`.
   - Setup reverse proxy (Nginx or Caddy) with SSL certificate provisioning.
   - Configure production PostgreSQL backup schedules and environment variables.
3. **Phase 5: User Acceptance Testing (UAT) & Cutover**:
   - Conduct workflow validation with representative users across each role.
   - Final data freeze and DNS transition from the legacy portal to the new application.
