# ASA Portal

Redesign and re-platform of the ASA timesheet management portal.

| Folder | Purpose |
|---|---|
| `legacy/` | Read-only reference copy of the current production app (React/Vite + Express/Prisma). Used as a behavioural baseline. |
| `apps/web` | New frontend — Next.js 16, React 19, TypeScript, Tailwind CSS 4. |
| `apps/api` | New backend — Fastify 5, TypeORM 0.3, Socket.IO, on the **existing** PostgreSQL schema. |
| `_local/` | Local-only secrets and DB dumps. Git-ignored. |

## Ground rules
- The PostgreSQL schema is not modified by the new backend (`synchronize: false`, no destructive migrations).
- New API endpoints keep the same paths and response shapes as `legacy/timesheet-backend`.
- No mock, sample or placeholder figures in the UI — real data or an explicit empty state.
- Brand palette: `#003887` (primary), `#8E8E93` (neutral), `#FFFFFF`.
