# ASA Practice Portal — Complete Guide

**Firm:** Ashish Shah & Associates (Chartered Accountants)  
**Portal URL:** `portal.asaind.co.in` (production) · `http://localhost:3000` (local development)  
**Last Updated:** October 2026

---

## Table of Contents

1. [What Is the ASA Portal?](#1-what-is-the-asa-portal)
2. [Technology Stack](#2-technology-stack)
3. [How the System Works (Architecture)](#3-how-the-system-works-architecture)
4. [Roles & Who Can Do What](#4-roles--who-can-do-what)
5. [Signing In & User Registration Flow](#5-signing-in--user-registration-flow)
6. [Portal Layout & Navigation](#6-portal-layout--navigation)
7. [Module 1 — Dashboard](#7-module-1--dashboard)
8. [Module 2 — Timesheet](#8-module-2--timesheet)
9. [Module 3 — Attendance](#9-module-3--attendance)
10. [Module 4 — My Portal (Self-Service)](#10-module-4--my-portal-self-service)
11. [Module 5 — Compliance & Governance](#11-module-5--compliance--governance)
12. [Module 6 — Management](#12-module-6--management)
13. [Module 7 — Accounts & Finance](#13-module-7--accounts--finance)
14. [Module 8 — Asset Management](#14-module-8--asset-management)
15. [Module 9 — Help Desk](#15-module-9--help-desk)
16. [Module 10 — Inbox](#16-module-10--inbox)
17. [Module 11 — Calendar](#17-module-11--calendar)
18. [Module 12 — Administration Portal](#18-module-12--administration-portal)
19. [Data Rules & Safety Guarantees](#19-data-rules--safety-guarantees)
20. [Security Architecture](#20-security-architecture)
21. [File Uploads & Storage](#21-file-uploads--storage)
22. [Notifications & Real-Time Updates](#22-notifications--real-time-updates)
23. [Running the Portal Locally](#23-running-the-portal-locally)
24. [Deployment on AWS (EC2 + S3)](#24-deployment-on-aws-ec2--s3)

---

## 1. What Is the ASA Portal?

The **ASA Practice Portal** is the firm's internal enterprise management platform, designed and built specifically for Ashish Shah & Associates — a Chartered Accountancy practice. It replaces the old `timesheet.asaind.co.in` portal with a modern, secure, and fully integrated system.

### What it covers

| Area | Purpose |
|---|---|
| **Timesheets** | All employees log hours worked against specific client engagements, projects, and jobs. |
| **Attendance** | Web-based daily clock-in and clock-out, replacing or supplementing biometric attendance. |
| **Leave** | Apply for leave, track balance, and manage multi-level approvals. |
| **Reimbursements** | Submit expense claims with receipts and route them through a 3-stage approval process. |
| **Management** | Maintain the master records for Employees, Clients, Projects, and Jobs. |
| **Accounts & Finance** | Full accounts receivable suite — invoices, receipts, bank reconciliation, payroll, ledgers, GST, and audit trail. |
| **Asset Management** | Track hardware/software inventory assigned to employees, from procurement to retirement. |
| **Help Desk** | Internal IT, HR, Finance and administrative support ticketing. |
| **Compliance** | Monitor and enforce the firm-wide 40-hour weekly timesheet standard. |
| **Administration** | Settings, access control, hierarchy, biometric devices, email configuration, and system health. |

### Design principles

- **No fake or sample data.** Every figure displayed is calculated live from the real database.
- **Same look for everyone.** The interface adapts to your role — what you see is role-governed — but the design quality is identical for every user.
- **Works everywhere.** Fully responsive — phones, tablets, laptops, and desktops.
- **Firm branding.** ASA Blue (`#003887`), grey (`#8E8E93`), white, and the ASA logo throughout.
- **Dark mode.** Toggle the sun/moon icon in the top-right corner.

---

## 2. Technology Stack

| Layer | Technology | Version |
|---|---|---|
| **Frontend** | Next.js + React | Next.js 16, React 19 |
| **Styling** | Tailwind CSS + Lucide Icons | Tailwind 4 |
| **State / Data Fetching** | TanStack React Query | v5 |
| **Backend API** | Fastify (TypeScript) | Fastify 5 |
| **Database ORM** | Prisma ORM | v6 |
| **Database** | PostgreSQL | v16 |
| **Real-time** | Socket.IO | v4 |
| **Authentication** | JWT (JSON Web Tokens) | RS256 |
| **File Uploads** | Fastify Multipart | Streaming, up to 50 MB |
| **TypeScript** | Strict mode, no implicit any | TypeScript 5.8 |

---

## 3. How the System Works (Architecture)

```
                    [ Browser — portal.asaind.co.in ]
                              │  HTTPS
                              ▼
                    [ Nginx Reverse Proxy ]
                    ┌──────────────────────┐
                    │  /api/* → :5000      │
                    │  /*     → :3000      │
                    └──────────────────────┘
                         │              │
                         ▼              ▼
              [ backend ]       [ frontend ]
              Fastify 5 API      Next.js 16 UI
              TypeScript         React 19
              Prisma ORM         TanStack Query
                         │
                         ▼
              [ PostgreSQL Database ]
              83 tables, all data lives here
                         │
                         ▼
              [ AWS S3 / Local Uploads ]
              Profile photos, documents,
              receipts, ticket attachments
```

### How a typical request flows

1. Employee opens a page (e.g. `/timesheet`) in their browser.
2. **Next.js** (`frontend`) serves the React page on port 3000.
3. The React component calls `api("timelogs/my")` → the API client prefixes this with `/api/` and attaches the JWT from `localStorage`.
4. **Nginx** forwards the `/api/*` request to the Fastify server on port 5000.
5. **Fastify** (`backend`) authenticates the JWT, enforces role-based permissions, queries PostgreSQL via Prisma, and returns JSON.
6. React Query caches the result, renders the data, and **auto-refreshes** every 30 seconds.
7. Any write action (save, approve, delete) goes through a React Query mutation, which calls the API and invalidates the cache so data refreshes immediately.

### Real-time updates

A **Socket.IO** connection is opened when the user signs in. The API server pushes events (new notifications, attendance changes, ticket updates) to the browser without waiting for a page refresh.

---

## 4. Roles & Who Can Do What

### The 14 roles in the system

| Role | Label | What They Do |
|---|---|---|
| `admin` | **Administrator** | Full unrestricted access to everything. Can manage all other users' permissions. |
| `owner` | **Owner** | Same as Admin. Represents the firm's named partners. |
| `hr` | **HR** | Manages employees (invite, approve, deactivate), leave policies, firm-wide attendance, compliance monitoring. |
| `it` | **IT** | Hardware and software assets, IT help desk tickets, biometric device configuration. |
| `manager` | **Manager** | Approves their team's timesheets, leaves, and expense claims. Sees team attendance. |
| `partner` | **Partner** | Same as Manager at Partner level. May oversee multiple teams. |
| `employee` | **Employee** | Logs own hours, marks own attendance, applies for leave, submits claims, raises tickets. |
| `accounts` | **Accounts** | Full access to the Accounts & Finance module. |
| `accounts_admin` | **Accounts Admin** | Senior accounts role, manages all Finance settings. |
| `accounts_manager` | **Accounts Manager** | Manages accounts team workflows. |
| `accounts_executive` | **Accounts Executive** | Data entry level for Accounts module. |
| `finance_approver` | **Finance Approver** | Approves the Finance step of expense reimbursements. |
| `ar_manager` | **AR Manager** | Manages accounts receivable — invoices, receipts, collections. |
| `ap_manager` | **AP Manager** | Manages accounts payable — payroll, vendor payments. |
| `accountant` | **Accountant** | General accounts access, reads assets, processes ledger entries. |

### Permission system

Beyond roles, **Admin** can grant any individual person custom access to any module (View / Create / Edit / Delete), overriding their role default. Managed in **Administration → Users & Access**.

### The 19 configurable permission modules

| Module | What it controls |
|---|---|
| `dashboard` | Dashboard visibility |
| `inbox` | Inbox & notifications |
| `calendar` | Firm calendar |
| `timesheet` | Timesheet logging and team review |
| `attendance` | Web attendance — check-in/out and team logs |
| `leaveManagement` | Leave applications and approval queue |
| `reimbursement` | Expense claims and approvals |
| `employees` | Employee directory and onboarding |
| `clients` | Client master data |
| `projects` | Project master data |
| `jobs` | Job master data |
| `reports` | Utilization reports and exports |
| `analytics` | Analytics dashboards |
| `compliance` | Timesheet compliance monitoring |
| `helpDesk` | Help desk ticketing |
| `assetManagement` | Asset inventory and assignment |
| `accounts` | Full Accounts & Finance suite |
| `adminPanel` | Administration portal settings |
| `emailTemplates` | Email template editor and mailbox config |

### Default access summary

| Module | Employee | Manager/Partner | HR | IT | Admin/Owner | Accounts Roles |
|---|---|---|---|---|---|---|
| Dashboard | ✅ own | ✅ team | ✅ firm | ✅ firm | ✅ firm | ✅ |
| Inbox | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Calendar | ✅ read | ✅ add/edit | ✅ add/edit | ✅ | ✅ full | ✅ read |
| Timesheet | ✅ own | ✅ own + team review | ✅ | ✅ | ✅ firm | ✅ read |
| Attendance | ✅ own | ✅ own + team | ✅ firm | configurable | ✅ firm | ✅ own |
| Leave | ✅ own | ✅ own + team approve | ✅ firm approve | ✅ own | ✅ firm | ✅ own |
| Reimbursements | ✅ own | ✅ approve team | ✅ | — | ✅ | Finance roles |
| Management (Employees) | read own | ✅ read | ✅ full | ✅ read | ✅ full | ✅ read |
| Management (Clients/Projects/Jobs) | projects only | ✅ | ✅ | ✅ | ✅ full | ✅ read |
| Reports | ✅ own | ✅ team | ✅ firm | ✅ firm | ✅ firm | ✅ own |
| Compliance | — | ✅ | ✅ | — | ✅ | — |
| Asset Management | requests only | requests only | ✅ admin | ✅ admin | ✅ admin | requests |
| Help Desk | ✅ | ✅ | ✅ HR tickets | ✅ IT tickets | ✅ | ✅ Finance tickets |
| Accounts & Finance | — | — | — | — | ✅ | ✅ |
| Administration | — | — | ✅ limited | ✅ limited | ✅ full | — |

---

## 5. Signing In & User Registration Flow

### Existing employees

1. Navigate to `portal.asaind.co.in`.
2. Enter **office email** and **password**.
3. A JWT token is issued and stored in `localStorage`.
4. Session automatically ends after **15 minutes of inactivity**.

### Forgot password

1. Click **"Forgot password?"** on the sign-in page.
2. Enter your office email — a one-time reset link is emailed to you.
3. Click the link, set a new password, and sign in.

### New joiner registration flow (complete lifecycle)

```
Admin/HR creates employee record in Management → Employees
        │
        ▼
System sends registration invite email
(contains a one-time token link, valid for 7 days)
        │
        ▼
New joiner clicks the link → /complete-registration page
        │
        ▼
New joiner fills in:
  • Sets their password
  • Personal details (address, date of birth, PAN number, Aadhaar number)
  • Emergency contact name, relation, and phone
  • Bank details (optional — account number, IFSC, bank name)
  • Profile photo (required)
  • KYC document scans (PAN card, Aadhaar card)
        │
        ▼
Admin / HR receives a notification
        │
        ▼
Admin / HR reviews and APPROVES the account
(via Management → Employees → Pending Approvals tab)
        │
        ▼
Employee receives approval notification and can now sign in
```

> **Important:** There is no public sign-up page. Anyone without an invitation is redirected to the login screen. Only HR and Admin can create new employee records and send invites.

- Admin can **reject** a joiner (with a reason), which notifies them and allows HR to reinvite.
- Admin can **resend** the registration invite at any time if the link has expired.

---

## 6. Portal Layout & Navigation

### Screen structure

```
┌───────────────────────────────────────────────────────────┐
│  TOP BAR                                                   │
│  [≡]  Page Title           [🔍 Search]  [🔔]  [🌙]  [👤] │
├──────────────┬────────────────────────────────────────────┤
│              │                                            │
│  LEFT MENU   │   MAIN CONTENT AREA                        │
│              │                                            │
│  Overview    │   Each module renders its content here.    │
│  • Dashboard │   Sub-tabs appear as a tab bar at the top. │
│  • Inbox     │                                            │
│  • Calendar  │                                            │
│              │                                            │
│  My Work     │                                            │
│  • Timesheet │                                            │
│  • Attendance│                                            │
│  • My Portal │                                            │
│              │                                            │
│  Operations  │                                            │
│  • Compliance│                                            │
│  • Management│                                            │
│  • Accounts  │                                            │
│  • Assets    │                                            │
│  • Help Desk │                                            │
│              │                                            │
│  Admin       │                                            │
│  • Admin     │                                            │
│    Portal    │                                            │
└──────────────┴────────────────────────────────────────────┘
```

### Top bar elements

| Element | Function |
|---|---|
| **≡ Menu icon** | Collapse/expand the sidebar. On mobile, opens a slide-over drawer. |
| **Page title** | Updates automatically as you navigate. |
| **Search (Ctrl+K)** | Global search across employees (name, ID, email), projects, and jobs. Results are clickable links. |
| **🔔 Bell** | Shows unread notification count. Opens a quick preview panel. Click to go to the full Inbox. |
| **🌙 / ☀ Toggle** | Switches between dark and light mode. Preference is saved. |
| **👤 Avatar menu** | Shows your name, role, and photo. Links to My Profile and Sign Out. |

### Left navigation groups

The menu only shows modules you have access to, grouped into:
- **Overview**: Dashboard, Inbox, Calendar
- **My Work**: Timesheet, Attendance, My Portal (Profile / Leave / Reimbursements / Reports)
- **Operations**: Compliance, Management, Accounts & Finance, Asset Management, Help Desk
- **Administration**: Administration Portal

---

## 7. Module 1 — Dashboard

**Route:** `/dashboard` · **Access:** Everyone

The dashboard is **role-aware** — same layout, different data scope:

- **Employee**: Own timesheet hours this week, today's attendance, leave balance, open tickets, recent notifications.
- **Manager/Partner**: Everything above, plus team pending approvals (leaves, claims, assets, tickets).
- **HR/Admin/IT/Owner**: Firm-wide figures — total employees, total clients, total hours this month, compliance percentage, all pending approvals.

### Dashboard cards

| Card | What it shows |
|---|---|
| **Weekly Hours** | Hours logged this week vs last week, daily bar chart. |
| **Today's Attendance** | Whether you are clocked in, elapsed time, last check-out. |
| **Leave Balance** | Remaining days by type (Privilege / Casual / Sick). |
| **Pending Approvals** | Count of items waiting for your action — leaves, claims, assets, tickets. |
| **Recent Activity** | Last 5–10 actions relevant to you. |
| **Upcoming Events** | Firm calendar events in the next 60 days. |
| **Upcoming Birthdays** | Team birthdays this month. |
| **Team Overview** | (Managers/HR/Admin) Team headcount, today's attendance, compliance status. |

> The dashboard refreshes all data **every 30 seconds** automatically.

---

## 8. Module 2 — Timesheet

**Route:** `/timesheet` · **Access:** Everyone (scope varies by role)

### How time logging works

Every hour worked must be logged against a specific engagement:

```
Client  →  Project  →  Job  →  Hours per day + Description
```

For example: `XYZ Ltd` → `Tax Audit FY2026` → `Documentation` → `Mon: 3h, Tue: 4h`

### Weekly grid

- Organized by **week** (Monday to Sunday).
- Navigate between weeks using arrows or a date picker.
- Add an entry by clicking **"Add Entry"** and selecting:
  - **Client** → **Project** → **Job** (cascading selectors, only active records shown)
  - **Billable?** (Yes/No toggle)
  - **Hours per day** for each day
  - **Description** (brief note on work done)

### Status lifecycle

```
DRAFT  →  SUBMITTED  →  APPROVED
                    └→  REJECTED  →  (edit & resubmit)
```

- Saved as **DRAFT** by default — fully editable.
- Click **"Submit Week"** to submit all entries for that week.
- Once submitted, entries are **locked** until rejected or approved.

### Manager / Partner approval view

- **Team tab** shows all team member submissions.
- **Approve** an individual's week (all entries approved at once).
- **Reject** with a mandatory comment — returns to employee for editing.

### Rules

- Jobs must be **Active** to appear in the selector.
- Minimum hours per entry: **0.25** (15 minutes).
- Submitted and approved entries **cannot be deleted**.

---

## 9. Module 3 — Attendance

**Route:** `/attendance` · **Access:** Everyone (scope varies by role)

### How web attendance works

#### Check-In
1. Click **"Check In"** on the attendance page.
2. The browser captures your IP address and (optionally) GPS coordinates.
3. A session opens with a live running timer.

#### Check-Out
1. Click **"Check Out"** when done.
2. The session closes. Duration is calculated automatically.
3. You can have **multiple sessions in a day** (e.g. check in at 9 AM, out at 1 PM for lunch, in at 2 PM, out at 6 PM).

The system sums all session durations for your **total hours for the day**.

### Daily status indicators

| Status | Meaning |
|---|---|
| **Present** | Checked in, total hours ≥ 8 |
| **Half Day** | Total hours between 4 and 8 |
| **Short Day** | Total hours < 4 |
| **Absent** | No check-in recorded |
| **Leave** | Day covered by an approved leave |
| **Holiday** | Official firm calendar holiday |

### Monthly calendar view

Each day shows status with color coding. Click a day to see the full punch timeline: exact in/out times, session durations, and location.

### Team and firm logs

| Role | Scope |
|---|---|
| Employee | Own attendance only |
| Manager/Partner | Direct team |
| HR | All employees (firm-wide) |
| Admin/IT | All employees, all locations |

Filters: date range, department, employee. Export to CSV.

### Admin corrections

HR and Admin can:
- **Force-checkout** an employee whose check-out was missed.
- **Update a punch**: Manually correct a check-in or check-out time for any date.

### Biometric device integration

Physical ESSL machines are configured in the Administration Portal. When connected:
- Biometric punches are synced periodically from the device into attendance logs.
- Each device employee ID is mapped to the corresponding portal employee in the biometric mapping table.
- The system creates or updates web attendance records from biometric data automatically.

---

## 10. Module 4 — My Portal (Self-Service)

**Route:** `/portal/*` · **Access:** Everyone

My Portal has four sub-sections accessible via tabs:

---

### 10.1 My Profile (`/portal/profile`)

| Section | Fields | Who Can Edit |
|---|---|---|
| **Personal Info** | Name, date of birth, personal email, mobile numbers | Self |
| **Address** | Current and permanent address | Self |
| **Emergency Contact** | Name, relation, phone | Self |
| **Bank Details** | Account holder, account number, IFSC, bank name | Self |
| **KYC** | PAN number, Aadhaar number | Self |
| **Profile Photo** | Upload a new photo | Self |
| **Documents** | PAN card scan, Aadhaar card scan, other files | Self |
| **Role, Designation, Reporting Lines** | Role, manager, partner | HR / Admin only |

**Change password** is available at the bottom — requires your current password.

---

### 10.2 Leave Management (`/portal/leaves`)

#### Applying for leave

1. Click **"Apply for Leave"**.
2. Select leave type, start date, end date.
3. Choose **Full Day** or **Half Day** (morning/afternoon).
4. Add a reason.
5. Submit.

**Leave day calculation is automatic:**
- **Weekends** (Saturday, Sunday) are excluded.
- **Firm calendar holidays** that fall within the period are excluded.
- Half-day = 0.5 days deducted.

#### Leave status lifecycle

```
PENDING  →  APPROVED  (by Manager/Partner/HR)
         └→  REJECTED  (with reason, can edit and resubmit)
```

Employees can **edit** their application while it is PENDING, **cancel** it before it starts, or **resubmit** after rejection.

Managers, Partners, and HR see a **Team Requests** tab for their team's pending applications.

---

### 10.3 Expense Reimbursements (`/portal/reimbursements`)

#### Common categories

Travel (local/outstation), Client Meals & Entertainment, Accommodation, Vehicle Fuel, Office Supplies, Communication.

#### Submitting a claim

1. Click **"New Claim"**.
2. Fill in: title, category, amount, date of expense, description.
3. Attach receipt images or PDFs as proof.
4. Submit.

#### Approval workflow

```
Employee SUBMITS
        │
        ▼
Manager/Partner APPROVES or REJECTS (with comment)
        │ (if approved)
        ▼
Finance/Accounts APPROVES or REJECTS (with comment)
        │ (if approved)
        ▼
Accounts marks PAID (with payment date and reference)
```

- **Self-approval is blocked** (except Admin/Owner).
- Editing is only possible in `PENDING` or `SENT BACK` status.
- Finance approvers see only claims that have cleared the manager step.
- Export all claims to CSV.

---

### 10.4 Reports (`/portal/reports`)

| Report | Who sees it |
|---|---|
| Utilization Summary | Everyone (scoped to own/team/firm by role) |
| Hours by Day (bar chart) | Everyone |
| Hours by Client | Everyone |
| Hours by Project | Everyone |
| Hours by Job | Everyone |
| Hours by Person | Managers, HR, Admin |
| Attendance Summary | HR, Admin, IT |
| Leave Summary | HR, Admin |
| Expense Claims | HR, Admin |

**Filters:** Period (this week / month / last month / last 30 days / custom), Client, Project.  
**Export:** All timesheet entries as CSV.

---

## 11. Module 5 — Compliance & Governance

**Route:** `/compliance` · **Access:** Admin, Owner, IT, HR, Managers, Partners (and anyone Admin grants compliance access)

The firm standard is **40 hours per week, Monday–Friday**.

### KPI cards

| KPI | Meaning |
|---|---|
| **% Compliant** | Employees who have met or exceeded 40 hours this week |
| **Missing Yesterday** | Employees who logged zero hours on the previous business day |
| **Below 40 Hours** | Employees likely to miss the standard |
| **Critical Risk** | Employees with very low hours |

### Compliance table

Every active employee with: weekly hours logged, billable hours, missing days, compliance status (Compliant / Partial / Non-Compliant / Critical), risk level, and reminder count.

### Actions

- **Send Reminder**: Automated email to the non-compliant employee.
- **Escalate**: Notification sent to the employee's manager and HR.
- **Export**: Download full compliance report as CSV.

### Other views

- **Department Analytics**: Compliance breakdown by department.
- **Trend View**: Last 4–8 weeks of firm-wide compliance percentage and average hours.

---

## 12. Module 6 — Management

**Route:** `/management/*` · **Access:** Depends on role and permissions

The master data hub for the firm's operations hierarchy:

```
Client → Project → Job → Timelog entries
```

Hours can only be logged against an **active Job** belonging to an **active Project** belonging to an **active Client**.

---

### 12.1 Employees (`/management/employees`)

**Access:** HR (full), Admin (full), Managers/Partners/IT/Accounts (read)

- Employee directory: searchable, paginated, filterable by Active / Pending / Inactive.
- **Invite Employee**: Enter name, email, designation, department, role, manager, partner → system sends the registration email.
- **Pending Approvals tab**: Approve (activates account) or Reject (with reason, emailed to joiner).
- Click any employee to view their full profile, leave balance, assigned assets, and documents.

---

### 12.2 Clients (`/management/clients`)

Fields: Name, alias, address, GST status, GSTIN, PAN, status.  
**Safety:** A client with logged hours **cannot be deleted** — only deactivated.

---

### 12.3 Projects (`/management/projects`)

Fields: Project name, project ID (auto-generated), client, status, start/end date, billable flag, contact person.  
**Safety:** A project with logged hours cannot be deleted. Deactivate instead.

---

### 12.4 Jobs (`/management/jobs`)

Jobs are what time is actually logged against.

Fields: Job name, combined ID (auto-generated `CLIENT-PROJ-JOB` code), project, status, billable flag, start/end date, description.  
**Safety:** A job with logged hours cannot be deleted. Deactivate instead.

---

## 13. Module 7 — Accounts & Finance

**Route:** `/accounts/*`  
**Access:** Admin, Owner, and all Accounts roles. HR and basic Employee roles cannot access this module.

All amounts are in **₹ INR** with multi-currency support at the invoice level. Every figure is calculated directly from underlying database records.

---

### 13.1 Overview (`/accounts`)

- **Receivables Summary**: Total outstanding, overdue amount, collected this month.
- **Aging Analysis**: Outstanding amounts split into 0–30, 31–60, 61–90, and 90+ days overdue.
- **Top Debtors**: Clients with highest outstanding.
- **Most Overdue Invoices**: Specific invoices most overdue.
- **Monthly Trend**: Billed vs Collected for the last 12 months.

---

### 13.2 Invoices (`/accounts/invoices`)

#### Creating an invoice

1. Select Billing Entity, Client, Currency, Exchange Rate (if not INR), Issue Date, Due Date.
2. Optionally add Project and UDIN (for CA certificates).
3. Add line items: Description, SAC Code, Quantity, Unit Price, GST Rate.
4. System auto-calculates: CGST + SGST (intra-state) or IGST (inter-state/export).
5. Save as **Draft** (editable) or **Mark as Sent** (locked, counts as billed).

#### Invoice lifecycle

```
DRAFT  →  SENT  →  PARTIALLY PAID  →  PAID
               └→  CANCELLED (only if no payments received)
```

Draft invoices are **not counted** in any receivable or GST figures. Once Sent, an invoice cannot be edited — only cancelled.

**Print / PDF**: Clean A4 tax invoice with entity letterhead, GSTIN, client details, SAC codes, GST split, bank details, and amount in words.

---

### 13.3 Receipts (`/accounts/receipts`)

Record money received from clients.

1. Select client, amount, payment date, payment mode (NEFT/RTGS/Cheque/Cash/UPI), reference number (UTR, cheque number).
2. Allocation mode:
   - **Auto (FIFO)**: Applies to oldest unpaid invoices first.
   - **Manual**: Select specific invoices and amounts.
3. System validates: no allocation beyond receipt amount, no draft invoices, currency must match.

---

### 13.4 Bank & Reconciliation (`/accounts/banking`)

#### Importing a bank statement

1. Download your bank statement as CSV from your banking portal.
2. Click **"Import CSV"** — file is parsed in the browser first.
3. Map columns: Date, Description, Credit, Debit, Balance.
4. Preview rows and upload to save as pending transactions.

#### Auto-Match

Compares unreconciled credit entries against open invoices. For confident matches, automatically creates a `Receipt` + `ReceiptAllocation` in a single database transaction.

#### Manual Reconciliation

For entries auto-match couldn't handle — link a transaction to: a specific Invoice, a Payroll Run, a Client (generic receipt), an Employee (expense settlement), or mark as Other.

---

### 13.5 Payroll & Payables (`/accounts/payables`)

#### Monthly payroll runs

1. Click **"New Payroll Run"** for a month/year.
2. Enter for each employee: Basic Salary, Allowances, Deductions → Net Payable.
3. Save as Draft, then **Mark as Paid** when payment is processed.
4. Marking paid automatically creates an `EMPLOYEE` Ledger entry for each person.

#### Reimbursement payout queue

All fully approved claims (Manager + Finance approved) awaiting payment. Mark as paid individually or in bulk.

---

### 13.6 Statements & Ledgers (`/accounts/client-ledger`)

Three views in one:

| View | What you see |
|---|---|
| **Client Statement** | All invoices and receipts for a selected client and date range, with running balance. Export to CSV. |
| **Employee Ledger** | Salary postings, reimbursements paid, and advances for a selected employee, with running balance. |
| **General Ledger** | All ledger entries across all types, filterable by date, type, and reference. Manual journal entry dialog for accounting adjustments. |

---

### 13.7 GST & Tax (`/accounts/gst-reports`)

#### GST Return Summary

Select period and billing entity to see:
- **B2B Supplies**: Taxable value, CGST, SGST, IGST for GST-registered clients.
- **B2C / Export**: Taxable value and taxes for unregistered clients.
- Total output tax liability. Export to CSV for filing.

#### Configured Tax Slabs

Manage GST and TDS rate configurations: Name, Type (GST/TDS/CESS), Rate (%), Active/Inactive.

---

### 13.8 Revenue & Expenses (`/accounts/revenue-expenses`)

- **Billed vs Collected by Month**: Bar chart for the current financial year.
- **Revenue by Client**: Billed amount per client in the period.
- **Expenses by Category**: Approved reimbursement payouts by category.

*(Note: Not a full P&L — payroll and non-portal costs are not included.)*

---

### 13.9 Currencies (`/accounts/currencies`)

- **Currency catalog**: Add/deactivate currencies (INR, USD, EUR, GBP, AED, SGD, JPY, CAD, AUD).
- **Exchange Rates**: Record rate against INR for a specific date. Used in invoice INR equivalents for reporting.

---

### 13.10 Finance Audit Log (`/accounts/audit-log`)

Tamper-proof trail of every action in the Accounts module:

| Column | Description |
|---|---|
| Action | What happened (Invoice Created, Receipt Recorded, Payroll Paid, etc.) |
| Table | Which database table was affected |
| Performed By | Which user took the action |
| Timestamp | When it happened |
| Old Value | Data before the change (JSON) |
| New Value | Data after the change (JSON) |

Filters: Action, Portal, Date Range, Search. Export to CSV.

---

### 13.11 Billing Entities (`/accounts/billing-entities`)

The firm may operate under multiple legal entities. Each entity has:

| Field | Description |
|---|---|
| Entity Name | Legal name (e.g. "Ashish Shah & Associates") |
| GSTIN | 15-digit GST number (validated against state code + PAN) |
| PAN | 10-digit PAN |
| Address | Registered address printed on invoices |
| Bank Details | Bank name, account number, IFSC, branch |
| Invoice Prefix | e.g. "ASA" for numbers like "ASA-2026-0001" |
| Status | Active / Inactive (never deleted) |

---

## 14. Module 8 — Asset Management

**Route:** `/admin/asset-management/*` and `/portal/my-assets`  
**Employee access:** Own allocated assets + submit requests  
**Admin/HR/IT access:** Full inventory management

---

### 14.1 Employee View — My Assets

Employees, Managers, Partners, and Accountants see:
- **Allocated Assets**: Everything currently assigned to them — tag, serial, make/model, date assigned, warranty expiry.
- **My Requests**: Status of all requests submitted.
- **Request an Asset**: Form to request new hardware or software (type, reason, quantity, required-by date, priority).

---

### 14.2 Admin/IT/HR View — Full Management

#### Overview tab
Assets in stock, assigned vs available vs in maintenance, warranties expiring in 60 days, assets by category chart, open requests, recent assignment activity.

#### Inventory tab

| Asset Status | Meaning |
|---|---|
| Available | Ready to assign |
| Assigned | Currently with an employee |
| In Maintenance | Sent for repair/servicing |
| Retired | End-of-life, taken out of service |
| Lost | Reported lost, stays on record |

Actions: Assign, Send for Maintenance, Mark Retired, Mark Lost. Export to Excel.

#### Assignments tab
Who currently has what (Take Back / Transfer actions) and full assignment history.

#### Requests tab (Admin/HR/IT)
Approve, reject, or **Hand Over** (selects an available asset, assigns it to the employee, and closes the request in one operation).

#### Maintenance tab
Log repairs, servicing, upgrades. Mark In Progress or Completed (asset returns to previous status on completion).

#### Vendors tab
Supplier directory with GSTIN. A vendor with linked assets cannot be deleted.

#### Setup tab
Master lists for: Asset Categories, Asset Types (e.g. "Dell Latitude 5530" under Laptop), and Locations.

---

## 15. Module 9 — Help Desk

**Route:** `/help-desk` · **Access:** Everyone

Internal support ticketing for IT, HR, Finance, and administrative needs.

### Ticket categories (configured by Admin)

Example structure:
- **IT**: Hardware Issues / Software / Network / Access & Passwords / New Setup
- **HR**: Policy Query / Payroll Query / Leave Query / Employee Benefits
- **Finance**: Invoice Query / Reimbursement Issue / GST / Other Finance
- **Admin**: Facility / Stationery / Other

Each category has a default assignee, SLA hours, and notification email addresses.

### Raising a ticket

1. Click **"Raise a Ticket"**.
2. Select Category and Issue Type (sub-category).
3. Set Priority: Low / Medium / High / Urgent.
4. Enter Subject and Description.
5. Attach files (images, PDFs, documents — up to 50 MB; dangerous file types blocked).
6. Submit — automatically assigned to the category's default assignee.

### Ticket detail view

- **Status badge**: Open / In Progress / Pending Requester / Resolved / Closed / Reopened.
- **SLA timer**: Countdown to resolution deadline (turns red when overdue).
- **Activity timeline**: Every action, message, and status change with timestamp and actor name.
- **Reply box**: Add a message visible to all parties.

### Support staff actions

| Action | Description |
|---|---|
| Start Work | Status → In Progress |
| Resolve | Status → Resolved; requester notified |
| Return to Requester | Status → Pending Requester (needs more info) |
| Reopen | If issue recurs after resolution |
| Reassign | Transfer to another team member |
| Escalate | Flag as escalated; notifies senior staff |
| Close | Final closure |

### Blocked file types (server-enforced)

`.html`, `.htm`, `.svg`, `.js`, `.mjs`, `.exe`, `.bat`, `.cmd`, `.ps1`, `.sh`, `.py`, `.php`, `.rb`

---

## 16. Module 10 — Inbox

**Route:** `/inbox` · **Access:** Everyone

Every portal notification — leave requests, ticket updates, approval requests, system alerts — is delivered here. The 🔔 bell shows the unread count.

### Notification types

| Type | Generated when |
|---|---|
| Leave Request | Someone submits a leave needing your approval |
| Leave Approved/Rejected | Your leave was actioned |
| Timesheet | Your submission was approved or rejected |
| Expense Claim | A claim needs your approval, or yours was actioned |
| Help Desk | A ticket was assigned to you, or yours was updated |
| Asset | A request was submitted or actioned |
| Employee | A new joiner is pending your approval |
| Compliance | Non-compliance flags or reminders |
| System | General announcements |

### Filters

Unread · Starred · Pinned · High Priority · Snoozed · Archived · By Module (HR / Finance / IT / Help Desk / etc.)

### Actions on a notification

Mark Read / Unread · Star · Pin · **Snooze until 9 AM tomorrow** · Archive · Delete · **Open linked page** (goes directly to the related record) · **Approve Employee** (inline, from the notification, without navigating away)

**Bulk actions**: Select multiple → Mark Read, Archive, or Delete.

---

## 17. Module 11 — Calendar

**Route:** `/calendar` · **Access:** Everyone

### Event types

| Type | Color | Meaning |
|---|---|---|
| **Holiday** | 🔴 Red | Official firm holiday — automatically excluded from leave calculations |
| **Meeting** | 🔵 Blue | Scheduled meetings and appointments |
| **Event** | 🟢 Green | Firm events, training sessions, celebrations |
| **Birthday** | 🟣 Purple | Team member birthdays (current month) |

### How holidays connect to leave

When an employee applies for leave spanning firm calendar holidays, those holiday dates are **not counted** as leave days — automatically.

**Example:** Leave from Dec 24–31 (8 calendar days). Dec 25 = firm holiday, Dec 27–28 = Saturday/Sunday. Only **5 working non-holiday days** are deducted.

### Who can add/edit/delete events

Managers, Partners, HR, Admin, and Owner. Regular employees can only view.

---

## 18. Module 12 — Administration Portal

**Route:** `/admin-portal/*`  
**Access:** Admin and Owner (full). HR and IT have limited sub-sections.

---

### 18.1 Overview (`/admin-portal/dashboard`)

Real-time system health:
- **Record Counts**: Total employees, clients, projects, jobs, timelogs, help desk tickets.
- **Server Health**: Node.js version, uptime, memory usage.
- **Database Health**: PostgreSQL version, active connections, database size on disk.
- **Storage**: Total uploaded files size.

---

### 18.2 Masters Configuration (`/admin-portal/masters`)

| Master | Used for |
|---|---|
| **Roles** | Employee role selector (name, code, description) |
| **Designations** | Titles like "Senior CA", "Audit Manager", "Article Assistant" |
| **Departments** | Groupings like "Audit", "Tax", "Accounts", "Admin" |
| **Employment Types** | Full Time / Part Time / Contract / Article / Intern |
| **Shifts** | Office shift timings — name, start time, end time |
| **Locations** | Office locations or branches |

For each: Add, Edit, **Deactivate** (items in use cannot be deleted — deactivate instead), Reactivate.

---

### 18.3 Users & Access Control (`/admin-portal/user-access`)

#### Two levels

- **Role Permissions**: Default access for everyone with a given role.
- **User Permissions**: Override for a specific individual (takes complete precedence over role defaults).

#### 19 modules × 4 actions

For each module: **View** / **Create** / **Edit** / **Delete**

#### Rules

- **Nobody can change their own permissions** — including Admin.
- Admin and Owner always have full access and cannot be restricted.
- User-level permissions completely replace (not add to) role-level permissions.

---

### 18.4 Organizational Hierarchy (`/admin-portal/hierarchy`)

- **Reporting Tree**: Visual org chart showing who reports to whom.
- **No Manager Warning**: Lists active employees with no assigned manager or partner — meaning nobody can approve their work.
- **Edit Reporting**: Admin, Owner, and HR can directly update any employee's Primary Reporting Manager, Primary Reporting Partner, and Secondary/Sub-Managers.

---

### 18.5 Biometric Devices (`/admin-portal/biometrics`)

#### Machine management fields

Device Name, IP Address, Port, Device Key, API Key, Branch, Sync Interval (minutes), Active toggle.

**Ping / Test Connection** checks if the device is reachable.

#### Employee mapping

Maps each biometric device employee ID (a number on the physical device) to a portal employee. **Auto-Match by Name** compares device names to employee names for suggestions.

#### Sync Logs

History of every sync — timestamp, records pulled, success/failure, and raw response.

---

### 18.6 Server & Storage (`/admin-portal/system`)

**System info**: API version, Node.js version, uptime, memory usage, PostgreSQL version and size, Help Desk ticket count.

**Storage File Browser**: View files organized by folder (`profile/`, `documents/`, `tickets/`, `temp/`, `logs/`), with file name, size, and last-modified date.
- **Delete individual files** — with confirmation dialog. Server validates path is inside `uploads/` before deleting.
- **Clear Temp Files**: Bulk delete `uploads/temp/`.
- **Clear Old Logs**: Delete log files older than 30 days.

---

### 18.7 Email Configuration (`/admin-portal/email-templates`)

#### Mailbox Connection

| Provider | Method |
|---|---|
| Microsoft 365 / Outlook | OAuth — connect your M365 account |
| Google Workspace / Gmail | OAuth — connect your Google Workspace account |
| Custom SMTP | Host, port, username, password |

**Test Email**: Send a test email to verify the connection.

#### Email Templates

System emails use templates with `{{placeholder}}` variables. The editor highlights any unrecognised placeholders as a warning.

#### Delivery Log

Every email the portal has attempted to send:

| Column | Description |
|---|---|
| Recipient | Email address it was sent to |
| Subject | Email subject |
| Status | Sent / Failed / Bounced |
| Category | What type of email this was |
| Sent At | Timestamp |

Filters: Status (Sent/Failed), Search (recipient or subject).

---

## 19. Data Rules & Safety Guarantees

### No deletion of records with history

| Record | Delete blocked when | Alternative |
|---|---|---|
| Client | Has any logged hours | Mark Inactive |
| Project | Has any logged hours | Mark Inactive |
| Job | Has any logged hours | Mark Inactive |
| Employee | Has timelogs, leaves, or claims | Deactivate account |
| Invoice | Any receipt allocated to it | Cancel invoice |
| Vendor | Has linked assets | Cannot delete |
| Billing Entity | Referenced by invoices | Mark Inactive |
| Master items | In use by any record | Deactivate |

### Other rules

- Every destructive action shows a **confirmation dialog** before proceeding.
- Every figure shown is **calculated live** from the database — no cached totals that can drift.
- The Finance **audit trail** records every create, update, and delete and cannot be edited through the portal.

---

## 20. Security Architecture

### Authentication

- **JWT** issued on login, stored in `localStorage`.
- **15-minute inactivity timeout**: Frontend auto-signs-out after inactivity.
- **No development bypass**: The server always requires a valid token.
- **bcrypt password hashing**: Plaintext comparison is never used.

### Authorization

Every API route requires:
1. A valid JWT (`authenticate` middleware).
2. Role-based or permission-based check.
3. Data scope enforcement — you cannot retrieve another user's personal data unless your role permits firm-wide access.

### Password protection

Passwords are **never** returned in any API response. The Fastify server has a global `preSerialization` hook stripping `password` fields from every response recursively.

### Security rules

- All database queries use **Prisma ORM parameterized queries** — no raw SQL with user input.
- File storage paths are validated with `path.resolve()` and boundary checks before read/delete.
- Users cannot modify their own role, permissions, or approval status.
- Self-approval of leave or expense claims is blocked (except Admin/Owner).

---

## 21. File Uploads & Storage

| Folder | Content |
|---|---|
| `uploads/profile/` | Employee profile photos |
| `uploads/documents/` | KYC documents, employee documents |
| `uploads/tickets/` | Help desk ticket attachments |
| `uploads/reimbursements/` | Expense claim receipts (images/PDFs) |
| `uploads/temp/` | Temporary files (cleared periodically) |
| `uploads/logs/` | System log files |

Files are streamed directly to disk (no full-load into memory). The saved path is stored in the database, and the frontend converts it to a URL using the `assetUrl()` helper. In production on AWS, `uploads/` maps to an S3 bucket.

---

## 22. Notifications & Real-Time Updates

### What triggers a notification

| Event | Who is notified |
|---|---|
| New leave request submitted | Employee's manager and HR |
| Leave approved/rejected | The employee |
| Timesheet submitted | The employee's manager |
| Timesheet approved/rejected | The employee |
| Expense claim submitted | The employee's manager |
| Claim actioned at each stage | The employee |
| New help desk ticket | The category's default assignee |
| Ticket status changed | The ticket creator |
| New employee completed registration | Admin and HR |
| Employee approved/rejected | The new employee |
| Asset request submitted | HR and IT |
| Asset request actioned | The requesting employee |
| Compliance reminder | The non-compliant employee |

### Real-time delivery

If you are logged in when the event happens, the notification appears in the bell icon immediately via **Socket.IO** — no page refresh needed.

---

## 23. Running the Portal Locally

### Prerequisites

- **Node.js 20+** installed
- **PostgreSQL 16** running with the `timesheet` database
- `.env` file in `legacy/timesheet-backend/` with `DATABASE_URL`, `JWT_SECRET`, and optionally email credentials

### Start both services together (recommended)

```bash
# From the project root folder
npm run dev
```

Starts:
- `backend` on `http://127.0.0.1:5000` (labeled `[api]` in cyan)
- `frontend` on `http://localhost:3000` (labeled `[web]` in magenta)

### Start separately

```bash
# Terminal 1 — API server
cd backend && npm run dev

# Terminal 2 — Web frontend
cd frontend && npm run dev
```

### Local test accounts

**Password for all accounts:** `see `_local/test-accounts.env` (TEST_PASSWORD) — never committed`

| Role | Email |
|---|---|
| Admin | `test.admin@asa-local.test` |
| HR | `test.hr@asa-local.test` |
| Manager | `test.manager@asa-local.test` |
| Partner | `test.partner@asa-local.test` |
| Employee | `test.employee@asa-local.test` |
| Accounts | `test.accounts@asa-local.test` |

---

## 24. Deployment on AWS (EC2 + S3)

### Target

`portal.asaind.co.in` → AWS EC2 + S3 + Nginx + PM2 + Let's Encrypt SSL

### Infrastructure diagram

```
Route 53 (portal.asaind.co.in → Elastic IP)
    │
    ▼
EC2 Instance (Ubuntu 24.04 LTS — t3.medium / t3.large)
    │
    ├── Nginx (reverse proxy + SSL termination)
    │     ├── /api/*      → Fastify  :5000
    │     ├── /uploads/*  → Fastify  :5000
    │     ├── /socket.io/ → Fastify  :5000  (WebSocket upgrade)
    │     └── /*          → Next.js  :3000
    │
    ├── PM2 (keeps both processes running, auto-restart on reboot)
    │     ├── asa-api  (Fastify — backend)
    │     └── asa-web  (Next.js — frontend)
    │
    ├── PostgreSQL 16 (same EC2, or AWS RDS for managed backups)
    │
    └── AWS S3 Bucket: asa-portal-storage
          └── uploads/ (profile photos, documents, receipts, attachments)
```

### Step-by-step checklist

#### 1. Launch EC2 instance

- Type: `t3.medium` (2 vCPU, 4 GB RAM) or larger
- OS: Ubuntu 24.04 LTS
- Security group: Open ports `22` (SSH), `80` (HTTP), `443` (HTTPS)
- Assign an **Elastic IP**

#### 2. Install on EC2

```bash
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PM2, Nginx, Certbot
sudo npm install -g pm2
sudo apt install -y nginx certbot python3-certbot-nginx
```

#### 3. DNS

In Route 53 (or your DNS provider), create:
- **Name:** `portal`
- **Type:** `A`
- **Value:** `<EC2 Elastic IP>`

#### 4. Nginx config (`/etc/nginx/sites-available/asa-portal`)

```nginx
server {
    listen 80;
    server_name portal.asaind.co.in;

    client_max_body_size 55M;

    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

#### 5. SSL (free, auto-renewing)

```bash
sudo certbot --nginx -d portal.asaind.co.in
```

#### 6. Production environment (`backend/.env`)

```env
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://asa_user:strongpassword@localhost:5432/timesheet
JWT_SECRET=<generate a 64-character random string — never reuse the dev secret>
FRONTEND_URL=https://portal.asaind.co.in
UPLOADS_DIR=/var/www/asa-portal/uploads

# Email — choose one provider
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=portal@asaind.co.in
SMTP_PASS=<app password>
```

#### 7. Start with PM2

```bash
# Build the apps
cd backend  && npm run build
cd frontend  && npm run build

# Start with PM2
pm2 start backend/dist/server.js --name "asa-api"
pm2 start frontend/node_modules/.bin/next --name "asa-web" -- start
pm2 save
pm2 startup    # Auto-restart on server reboot
```

#### 8. S3 for file storage (recommended for production)

- Create bucket: `asa-portal-storage`
- Attach IAM role to EC2 with permissions: `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`
- Update the upload handlers to use the AWS S3 SDK instead of local disk writes
- Set `UPLOADS_DIR` in env to the S3 bucket path or configure S3 as the storage backend

#### 9. Database backups (critical)

```bash
# Add to crontab: daily backup at 2 AM
0 2 * * * pg_dump -U postgres timesheet | gzip > /backups/timesheet-$(date +\%Y\%m\%d).sql.gz

# Keep only last 30 days
0 3 * * * find /backups -name "timesheet-*.sql.gz" -mtime +30 -delete
```

---

## Folder Structure Reference

```
WebApp/
├── apps/
│   ├── api/                    # New Fastify 5 API server (Phase 3)
│   │   ├── src/
│   │   │   ├── config/         # env, database, JWT config
│   │   │   ├── modules/        # Route handlers (one file per module)
│   │   │   └── plugins/        # Auth, socket, multipart plugins
│   │   └── prisma/             # Prisma schema (same as legacy)
│   └── web/                    # Next.js 16 frontend
│       └── src/
│           ├── app/
│           │   └── (portal)/   # All authenticated portal screens
│           ├── components/     # Per-module UI components + api.ts hooks
│           └── lib/            # Shared utilities (auth, api, roles, nav, etc.)
├── legacy/
│   └── timesheet-backend/      # Patched original Express backend (fallback)
├── docs/                       # Documentation
│   ├── PORTAL_COMPLETE_GUIDE.md    # This file
│   ├── DEVELOPMENT_STATUS_REPORT.md
│   ├── HOW_IT_WORKS.md
│   ├── BACKEND_FINDINGS.md
│   └── URGENT_SECURITY_HOTFIX.md
├── scripts/
│   └── dev.mjs                 # Concurrent dev runner
└── package.json                # Root monorepo scripts
```

---

*For technical security audit findings, see [`docs/BACKEND_FINDINGS.md`](./BACKEND_FINDINGS.md).*  
*For the development history and progress log, see [`docs/DEVELOPMENT_STATUS_REPORT.md`](./DEVELOPMENT_STATUS_REPORT.md).*  
*For the simplified non-technical guide, see [`docs/HOW_IT_WORKS.md`](./HOW_IT_WORKS.md).*
