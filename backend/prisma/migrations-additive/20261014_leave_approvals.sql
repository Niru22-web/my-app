-- ASA Portal additive migration: two-step leave approval, expected day hours, carry-forward mode (14 Oct 2026)
-- Alters only tables created by 20261013_leave_rules.sql and creates leave_approvals. Existing tables are not altered.
-- Apply after 20261013: npx prisma db execute --file prisma/migrations-additive/20261014_leave_approvals.sql --schema prisma/schema.prisma

-- AlterTable
ALTER TABLE "firm_settings" ADD COLUMN     "leaveApprovalLevels" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "standardDayHours" DOUBLE PRECISION NOT NULL DEFAULT 8;

-- AlterTable
ALTER TABLE "leave_types" ADD COLUMN     "carryForward" TEXT NOT NULL DEFAULT 'none';

-- CreateTable
CREATE TABLE "leave_approvals" (
    "id" TEXT NOT NULL,
    "leaveId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "approverId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leave_approvals_leaveId_idx" ON "leave_approvals"("leaveId");

-- AddForeignKey
ALTER TABLE "leave_approvals" ADD CONSTRAINT "leave_approvals_leaveId_fkey" FOREIGN KEY ("leaveId") REFERENCES "leaves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_approvals" ADD CONSTRAINT "leave_approvals_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

