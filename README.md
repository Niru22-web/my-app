# ASA Practice Portal

The firm's internal portal for Ashish Shah & Associates: timesheets, attendance, leave, reports, management, accounts, assets, help desk and administration.

## Project layout

| Folder | What it holds |
|---|---|
| `frontend/` | The website — Next.js 16, React 19, TypeScript, Tailwind CSS 4. Screens only; it talks to the backend through `/api`. |
| `backend/` | The API — Fastify 5, Prisma 5, Socket.IO, on the firm's PostgreSQL database. |
| `backend/prisma/` | Database schema (`schema.prisma`) and reviewed, additive-only migrations (`migrations-additive/`). |
| `backend/scripts/` | One-off tools, e.g. `import-zoho.cjs` (Zoho People + asset register import). |
| `backend/uploads/` | **Data, not code** — uploaded photos, documents, receipts, ticket attachments. Git-ignored. |
| `backend/.env` | **Settings, not code** — database URL, JWT secret. Git-ignored; copy from `.env.example`. |
| `docs/` | Guides: `PORTAL_COMPLETE_GUIDE.md`, `HOW_IT_WORKS.md`, `FEATURE_PARITY.md`, `ROADMAP_HR_PAYROLL.md`. |
| `legacy/` | The old Express/React portal, kept read-only for reference. |
| `scripts/dev.mjs` | Starts backend and frontend together. |
| `_local/` | Local-only secrets, test logins and data exports. Git-ignored. |

## Deploying

Website on Vercel, API + database on Render: step by step in [DEPLOY.md](DEPLOY.md).

## Run it locally

Prerequisites: Node.js 20+, PostgreSQL 16 with the `timesheet` database.

```bash
npm --prefix backend install
npm --prefix frontend install
npm run prisma:generate
npm run dev
```

- Backend: http://127.0.0.1:5000 (health check: `/api/health`)
- Frontend: http://localhost:3000

Database changes are only ever **added** (new tables/columns) through the SQL files in `backend/prisma/migrations-additive/`, applied in date order:

```bash
cd backend
npx prisma db execute --file prisma/migrations-additive/20261013_leave_rules.sql --schema prisma/schema.prisma
npx prisma db execute --file prisma/migrations-additive/20261014_leave_approvals.sql --schema prisma/schema.prisma
```

On Windows, stop the dev server before `npm run prisma:generate` (the database engine file is locked while it runs).
