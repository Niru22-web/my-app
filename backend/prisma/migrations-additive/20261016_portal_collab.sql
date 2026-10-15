-- ASA Portal additive migration (16 Oct 2026): bug tracker, announcements, wishes, releases, feedback.
-- Creates 9 NEW tables; no existing table is altered.
-- Apply: npx prisma db execute --file prisma/migrations-additive/20261016_portal_collab.sql --schema prisma/schema.prisma

-- CreateTable
CREATE TABLE "bug_reports" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'Bug',
    "module" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'Medium',
    "status" TEXT NOT NULL DEFAULT 'Open',
    "environment" TEXT NOT NULL DEFAULT 'UAT',
    "pageUrl" TEXT,
    "externalRef" TEXT,
    "reporterId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "dueDate" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bug_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bug_events" (
    "id" TEXT NOT NULL,
    "bugId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT,
    "fromValue" TEXT,
    "toValue" TEXT,
    "files" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bug_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Announcement',
    "audience" JSONB,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "recipientIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "templateId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_reads" (
    "announcementId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_reads_pkey" PRIMARY KEY ("announcementId","employeeId")
);

-- CreateTable
CREATE TABLE "wish_templates" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "festivalOn" DATE,
    "autoSend" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "theme" TEXT NOT NULL DEFAULT 'classic',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wish_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wish_log" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "templateId" TEXT,
    "employeeId" TEXT,
    "forDate" TEXT NOT NULL,
    "announcementId" TEXT,
    "sentById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wish_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "releases" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sections" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_seen" (
    "employeeId" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_seen_pkey" PRIMARY KEY ("employeeId")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Idea',
    "rating" INTEGER,
    "message" TEXT NOT NULL,
    "module" TEXT,
    "pageUrl" TEXT,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "response" TEXT,
    "respondedById" TEXT,
    "respondedAt" TIMESTAMP(3),
    "bugId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bug_reports_code_key" ON "bug_reports"("code");

-- CreateIndex
CREATE INDEX "bug_reports_status_idx" ON "bug_reports"("status");

-- CreateIndex
CREATE INDEX "bug_reports_assigneeId_idx" ON "bug_reports"("assigneeId");

-- CreateIndex
CREATE INDEX "bug_events_bugId_idx" ON "bug_events"("bugId");

-- CreateIndex
CREATE INDEX "bug_events_createdAt_idx" ON "bug_events"("createdAt");

-- CreateIndex
CREATE INDEX "announcements_status_idx" ON "announcements"("status");

-- CreateIndex
CREATE INDEX "wish_templates_kind_idx" ON "wish_templates"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "wish_log_kind_employeeId_forDate_key" ON "wish_log"("kind", "employeeId", "forDate");

-- CreateIndex
CREATE UNIQUE INDEX "releases_version_key" ON "releases"("version");

-- CreateIndex
CREATE INDEX "feedback_status_idx" ON "feedback"("status");

