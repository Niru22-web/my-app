-- ASA Portal additive migration (18 Nov 2026): indexes for the lookups every page makes.
-- Adds 9 NEW indexes; no table or column is created, altered or dropped, and no data changes.
-- Safe to run more than once (IF NOT EXISTS). Index names match Prisma's defaults, so schema.prisma stays in step.
-- Apply: npx prisma db execute --file prisma/migrations-additive/20261118_performance_indexes.sql --schema prisma/schema.prisma

-- Notification bell / inbox: "my unarchived notifications, newest first" runs on every page load.
CREATE INDEX IF NOT EXISTS "notifications_userId_isArchived_createdAt_idx" ON "notifications" ("userId", "isArchived", "createdAt");

-- Dashboard activity feed: a person's own events, and the firm-wide feed (newest first).
CREATE INDEX IF NOT EXISTS "activities_userId_createdAt_idx" ON "activities" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "activities_createdAt_idx" ON "activities" ("createdAt");

-- Leave: a person's leave history, and approval queues by status.
CREATE INDEX IF NOT EXISTS "leaves_employeeId_idx" ON "leaves" ("employeeId");
CREATE INDEX IF NOT EXISTS "leaves_status_idx" ON "leaves" ("status");

-- Claims: a person's claims, and approval queues by status.
CREATE INDEX IF NOT EXISTS "reimbursements_employeeId_idx" ON "reimbursements" ("employeeId");
CREATE INDEX IF NOT EXISTS "reimbursements_status_idx" ON "reimbursements" ("status");

-- Help desk: "my open tickets" on the dashboard, and the open/in-progress queue.
CREATE INDEX IF NOT EXISTS "tickets_createdById_idx" ON "tickets" ("createdById");
CREATE INDEX IF NOT EXISTS "tickets_status_idx" ON "tickets" ("status");
