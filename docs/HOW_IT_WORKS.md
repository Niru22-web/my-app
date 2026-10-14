# ASA Portal — How It Works

A plain-language guide to the new ASA Portal: what each part does, who can use it, and what to keep in mind.

---

## 1. What is the ASA Portal?

The ASA Portal is the firm's internal website for everyday work: logging hours, attendance, leave, expense claims, help-desk tickets, client and project records, compliance, and finance.

It is a **redesign** of the existing timesheet portal (timesheet.asaind.co.in). The new version:

- looks the same for every role and works on phones, tablets and computers;
- uses the firm's colours (ASA blue `#003887`, grey `#8E8E93`, white) and the ASA logo;
- has a dark mode (moon icon at the top right);
- never shows sample or made-up numbers. If there is no data, it says so plainly;
- uses the **same database and the same server** as the current portal, so no data is lost or duplicated.

### How the pieces fit together

```
  Your browser  ──►  New ASA Portal website  ──►  New ASA Portal server (API)  ──►  Database
   (screens)          (frontend — Next.js)         (backend — Fastify)             (PostgreSQL)
```

- **Website (`frontend`):** the screens you see. Built with Next.js.
- **Server (`backend`):** the new hardened Phase 3 API server built with Fastify, Prisma and Socket.IO. It connects to the exact same PostgreSQL database while fixing every security and data-integrity issue recorded in `docs/BACKEND_FINDINGS.md`.
- **Database:** where everything is stored — employees, hours, leave, claims, tickets, assets, finance records and so on.

---

## 2. Signing in and roles

- Sign in with your **office email and password**.
- You are signed out automatically after **15 minutes without activity**, to protect your data.
- **Forgot password:** use the link on the sign-in page; a reset link is emailed to you.
- **New joiners:** HR invites you from Management → Employees. The email link opens **Complete registration**: set your password, add your details and address, and upload your PAN, Aadhaar and a photo (bank details are optional). HR then approves your account and you can sign in. There is no public sign-up page; anyone without an invitation is sent to sign-in.

Everyone sees the same design, but what you can open depends on your **role**:

| Role | In simple terms |
|---|---|
| **Employee** | Logs own hours, attendance, leave and claims; raises help-desk tickets. |
| **Manager** | Everything an employee does, plus approves their team's hours, leave and claims. |
| **Partner** | Like a manager, at partner level. |
| **HR** | Employees, leave, attendance for the whole firm, HR tickets. |
| **IT** | Help-desk tickets. Extra access (for example team attendance) only if Admin grants it. |
| **Accounts / Finance roles** | Accounts & Finance area and the finance step of claims. |
| **Admin / Owner** | Everything, including settings and permissions. |

Admin can also give individual people extra access per module (view / add / edit / delete).

---

## 3. The screen layout

- **Left menu:** every module you are allowed to use, grouped into *Overview*, *My Work*, *Operations* and *Administration*. It can be collapsed. On phones it opens from the ☰ button.
- **Top bar:** page title, **search** (press `Ctrl + K` to find people, projects and jobs), dark-mode switch, **bell** for notifications, and your account menu.
- **Messages:** small pop-ups at the bottom confirm when something is saved, or explain what went wrong.

---

## 4. Modules, one by one

Status key: ✅ ready in the new design and backed by the new `backend` server.

### ✅ Dashboard
Your home page. Shows a greeting, today's attendance, hours logged this week, leave balance, items waiting for your approval, upcoming events and birthdays, and recent activity. Managers and admins also see team and firm figures. Everything shown comes from real records and refreshes every 30 seconds.

### ✅ Timesheet
Where you record the hours you worked.
- Pick a week, choose **client → project → job**, and enter hours per day.
- Mark work as billable or non-billable and add a short description.
- **Submit** the week for approval. Your manager approves or sends it back with a comment.
- Managers and partners use **Team** to review and approve their people's timesheets.

### ✅ Attendance
Your daily check-in and check-out.
- **Check in** when you start and **check out** when you finish. You can have several sessions in a day (for example before and after lunch).
- **My attendance** shows a month calendar and your hours per day.
- **Team / firm logs:** HR and Admin see everyone; managers and partners see their team; IT only if Admin has given permission.
- HR/Admin can correct a missed check-out.

### ✅ My Portal
Your personal area, with tabs:
- **Profile** — your personal details, emergency contacts, bank details, address, photo, documents, and change password. Saving your profile updates only your personal details without touching reporting lines or role settings.
- **Leave** — apply for leave, see your balance and history, edit or cancel pending requests.
  - Leave counts **working days only**: weekends and firm holidays on the calendar are not deducted.
  - A half day must fall on a working day.
  - Managers, partners and HR approve or reject team requests under **Team requests**.
- **Reimbursements** — submit expense claims (travel, meals and so on) with **receipt file attachments** (PDF/images) and track them through each stage: manager approval → finance → paid. Approvers see only the actions that fit their stage. Export to CSV is available.
- **Reports** — see below.

### ✅ Inbox
All your notifications in one place (the bell shows the latest ones).
- Filter by **Unread, Starred, Pinned, High priority, Snoozed, Archived**, or by module (HR, Finance, IT, Help Desk…), and search.
- Open a notification to read it, **open the related page**, star, pin, mark read or unread, **snooze until tomorrow 9 AM**, archive or delete.
- Select several at once to mark read, archive or delete them together.
- For a new joiner waiting for approval, Admin, managers and partners can **Approve employee** directly from the notification.

### ✅ Calendar
The firm calendar.
- Month view with **holidays** (red), **meetings** (blue) and **events** (green). This month's birthdays are shown too.
- Click a day to see what's on it; **Coming up** lists the next 60 days.
- Admin, HR, partners, managers and the owner can **add**, **edit** or **remove** events.
- Holidays added here are automatically **not counted** when someone applies for leave over them.

### ✅ Compliance
Shows whether people have filled in their timesheets this week (target: **40 hours, Monday–Friday**).
- Summary cards: percentage compliant, how many missed yesterday, how many are under 40 hours, and how many are at critical risk.
- A trend of the last few weeks (as a chart or a table) and a breakdown by department.
- A list of everyone with hours, missing days, status and risk, with search and filters, plus **Export** to CSV.
- Admin, HR, managers and partners can **send a reminder email**; Admin and HR can **escalate** to the person's manager and HR.

### ✅ Management
Master records, as tabs:
- **Employees** — invite new joiners (they get an email to finish registration), approve pending joiners, activate or deactivate people, edit records (HR/Admin).
- **Clients**, **Projects**, **Jobs** — add, edit, and mark active or inactive. Hours are always logged against a job, which belongs to a project, which belongs to a client.
- To protect history, records **can only be deleted if no hours were logged against them**; otherwise mark them inactive.

### ✅ Help Desk
Raise and track support requests (IT, HR, Finance and others).
- **Raise a ticket:** pick a category and issue type, set priority, describe the problem and attach files (up to 50 MB; safe file types only). It is routed automatically to the right person.
- Each ticket shows a **timeline** of everything that happened, a reply box, and an **SLA** timer (how long the team has to fix it). Overdue tickets are flagged.
- Support staff can start work, resolve, return to the person who raised it, reopen, reassign or escalate.
- Admin manages **Categories & routing**: teams, SLA hours, who gets tickets automatically, and notification emails.

### ✅ Reports
Under **My Portal → Reports** (Admin, Owner, HR, IT, managers, partners, and anyone Admin gives report access).
- Pick a period (this week, this month, last month, last 30 days, or custom dates), and optionally a client or project.
- See **hours logged**, **billable hours**, **approved hours**, and how many people logged time.
- A chart of hours per day (or per week for longer periods), split into billable and non-billable.
- **Where the time went:** hours by client, project, job or person.
- **Export entries** downloads every timesheet line in the period as a spreadsheet (CSV).
- Whose data you see is written at the top: Admin, Owner, HR and IT see **everyone across the firm**, managers and partners see **their team**, and everyone else sees **their own** entries.
- Admin, Owner, HR and IT also see attendance, leave and expense-claim totals for the period.

### ✅ Asset Management / My assets
**Employees, managers, partners and accountants** see **My assets**:
- What equipment is assigned to you (serial, tag, since when, warranty).
- **Request an asset**: say what you need, why, how many and by when. IT and HR are notified. Track each request: Pending → Approved → handed over (or Rejected, with the reason).

**Admin, HR and IT** (and anyone Admin gives asset access) see the full area, with tabs:
- **Overview**: assets in service, how many are with people, available or in maintenance, warranties ending in the next 60 days, assets by category, open requests and recent assignments. All counted from the real records.
- **Inventory**: every asset with search and filters. Add or edit assets, **assign** an available asset to someone, send it for maintenance, **retire** it or mark it **lost** (it stays on record with its history), or bring it back into stock. Export to Excel.
- **Assignments**: who has what right now, and the history. **Take back** an asset (with its condition) or **transfer** it to someone else.
- **Requests** (Admin, HR and IT): approve or reject requests, then **hand over** an available asset, which assigns it and closes the request in one step.
- **Maintenance**: log repairs, servicing and upgrades; mark them in progress and completed (the asset returns to its previous status).
- **Vendors**: suppliers with contact details and GSTIN; a vendor with assets linked can't be deleted.
- **Setup**: the lists of categories, types (for example Laptop → Dell Latitude) and locations used in the forms.

Status changes only happen through these actions, never by editing, so the inventory and assignments always agree.

### ✅ Administration
Settings and health of the portal. Each tab appears only for the roles that can use it:

| Tab | Who | What it does |
|---|---|---|
| **Overview** | Everyone in Administration | Real record counts (employees, clients, projects, timesheet entries) and server, database and storage health for Admin, Owner and IT. |
| **Masters** | View: Admin, Owner, IT, HR · Change: Admin, IT | Roles (with a short code), designations, departments, employment types, shifts (with hours) and locations. Deactivate things that are no longer used; something still in use can't be deleted. |
| **Users & access** | Admin, Owner | Give a person, or everyone with a role, access to modules (view / add / edit / delete), including **Jobs** and **Analytics**. A person's own list replaces their role's list. Nobody can change their own access. |
| **Hierarchy** | Admin, Owner, IT, HR | Who reports to whom, team sizes, a warning listing active people with **no manager or partner**, and **Edit reporting** so Admin, Owner and HR can assign primary/secondary managers and partners directly. |
| **Biometric devices** | Admin, IT | ESSL machines (add, test connection, pull punches, enable or disable) and linking each device ID to the right employee, including auto-match by name. |
| **Server & storage** | Admin, Owner, IT | Server, memory and database health (including Help Desk ticket counts), uploaded files browser by folder with **single-file deletion**, and clearing temporary files or old logs. |
| **Email** | Admin | Connect or disconnect the sending mailbox (Microsoft 365, Google Workspace or SMTP), send a test email, edit email templates (with a warning for unknown placeholders), and inspect the **Delivery log**. |

### ✅ Accounts & Finance
For Admin, Owner and the accounts team (`accounts`, `accounts_admin`, `accounts_manager`, `accounts_executive`, `finance_approver`, `ar_manager`, `ap_manager`, `accountant`, or anyone with **Accounts & Finance** access enabled).

All amounts are shown in ₹, each document at its own exchange rate. **Drafts and cancelled invoices are never counted.**

- **Overview**: money to be collected, how much is overdue, billed and collected this month, receivables by how late they are (by due date), who owes the most, and the most overdue invoices.
- **Invoices**: create an invoice (billing entity, client, optional project and UDIN, dates, currency and rate, line items with SAC and GST rate). The preview shows CGST + SGST or IGST exactly as it will be saved. It starts as a **draft**, which can be edited or deleted. **Mark as sent** makes it count as billed; after that it can't be edited, only cancelled (if nothing has been paid). **Print / PDF** gives a clean A4 tax invoice with bank details and the amount in words. Export to CSV.
- **Receipts**: record money received. You can allocate receipts against **specific invoices** (with custom amounts) or automatically apply to the client's oldest unpaid invoices first.
- **Bank & reconciliation**: import real CSV bank statements (with client-side parsing and column preview), add manual credit/debit lines, **auto-match** deposits against open invoices (creating receipts and allocations in a single transaction), or **manually reconcile** bank lines to invoices, payroll runs, clients or employees.
- **Payroll & payables**: generate monthly employee salary runs (basic salary, allowances, deductions), mark runs paid (with automatic employee ledger postings), and manage the approved expense claims payout queue.
- **Statements & ledgers**: switch between **Client statements**, **Employee ledger**, and the **General ledger**, with running balances, CSV export, and manual journal entry posting.
- **GST & tax**: output tax by month, quarter or financial year, per billing entity, split into B2B and B2C/export, with taxable value, CGST, SGST and IGST, plus **Configured GST & TDS tax slabs** management.
- **Revenue & expenses**: billed and collected by month for a financial year, billed by client, and expense claims paid by category.
- **Currencies**: configure currencies (INR, USD, EUR, GBP, AED, SGD, etc.) and record historical exchange rates to INR.
- **Audit log**: searchable, filterable finance audit trail recording every invoice, receipt, bank reconciliation, payroll, ledger, tax, and currency action.
- **Billing entities**: the firm's legal entities with GSTIN and PAN (checked against each other), address, the bank account printed on invoices, and the invoice-number prefix and format. Entities are deactivated, never deleted.

---

## 5. Data safety rules we follow

- **No fake numbers.** Every figure comes from the database. If there is nothing, the screen says so.
- **Nothing is deleted by surprise.** Deleting always asks for confirmation, and records with history are deactivated instead.
- **Only in-portal links are followed** from notifications, to block phishing links.
- **Every issue recorded in `docs/BACKEND_FINDINGS.md`** has been fixed in both the new `backend` server and backported to `legacy/timesheet-backend`.

---

## 6. The plan (phases)

| Phase | What | Status |
|---|---|---|
| 0 | Set up tools and the new project folder | Done |
| 1 | Copy of real data on a local computer for testing | Done (local PostgreSQL `timesheet` DB + seed scripts) |
| 2 | New website (`frontend`) | Done — every module and sub-tab built |
| 3 | New, safer server (`backend`, same database) that fixes every recorded problem | Done |
| 4 | Hosting set-up (servers, storage, backups) | Next |
| 5 | Full testing with real users, then switch the live portal over | After Phase 4 |

---

## 7. Running it on your computer (for the tech team)

You need: Node.js 20 or newer, and PostgreSQL 16 with the local `timesheet` database.

### Option A: Start both API and Web together from the root folder
```bash
npm run dev
```
This launches both `backend` (`http://127.0.0.1:5000`) and `frontend` (`http://localhost:3000`) concurrently.

### Option B: Start each service separately
1. **Start the new API server** (in `backend`): `npm run dev` → runs at http://127.0.0.1:5000
2. **Start the new website** (in `frontend`): `npm run dev` → open http://localhost:3000
3. **Sign in** with one of the local test accounts (`_local/sample-logins.txt` — kept private, never uploaded).

### Folder guide

| Folder | What's inside |
|---|---|
| `frontend` | The new ASA Portal website (Next.js 16 + React 19) |
| `backend` | The new Phase 3 ASA Portal API server (Fastify 5 + Prisma + Socket.IO) |
| `legacy/timesheet-backend` | The legacy Express server (also patched with security & bug fixes) |
| `legacy/timesheet-frontend` | The old website, kept for reference |
| `docs` | This guide, backend findings and the security hot-fix note |
| `_local` | Private local files (passwords, test logins, backups). **Never uploaded** |
