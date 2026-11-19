-- ASA Portal additive migration (19 Nov 2026): payroll engine (salary structures, monthly runs, lines).
-- Creates 3 NEW tables; no existing table or column is altered and no data changes.
-- Apply: npx prisma db execute --file prisma/migrations-additive/20261119_payroll_engine.sql --schema prisma/schema.prisma

-- CreateTable
CREATE TABLE "payroll_structures" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "employeeId" TEXT,
    "name" TEXT NOT NULL,
    "gender" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "dateOfJoining" DATE,
    "dateOfLeaving" DATE,
    "pfApplicable" BOOLEAN NOT NULL DEFAULT false,
    "esicApplicable" BOOLEAN NOT NULL DEFAULT false,
    "basicPct" DOUBLE PRECISION,
    "ctc" DOUBLE PRECISION,
    "basic" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hra" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "conv" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bonus" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pfEmployee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "esicEmployee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pfEmployer" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "esicEmployer" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "structureSource" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalisedById" TEXT,
    "finalisedAt" TIMESTAMP(3),

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_lines" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "structureId" TEXT NOT NULL,
    "basic" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hra" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "conv" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bonus" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gross" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pfEmployee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "esicEmployee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pfEmployer" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "esicEmployer" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netPay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDays" DOUBLE PRECISION NOT NULL,
    "lopDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidDays" DOUBLE PRECISION NOT NULL,
    "pfApplicable" BOOLEAN NOT NULL DEFAULT false,
    "esicApplicable" BOOLEAN NOT NULL DEFAULT false,
    "basicPct" DOUBLE PRECISION,
    "ctc" DOUBLE PRECISION,
    "calcBasis" TEXT NOT NULL,
    "remarks" TEXT,
    "approvalStatus" TEXT NOT NULL DEFAULT 'Pending',
    "approvalRemarks" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "timesheetName" TEXT,
    "timesheetPath" TEXT,
    "timesheetById" TEXT,
    "timesheetAt" TIMESTAMP(3),
    "payrollId" TEXT,

    CONSTRAINT "payroll_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payroll_structures_employeeId_idx" ON "payroll_structures"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_structures_entityId_name_key" ON "payroll_structures"("entityId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_entityId_month_key" ON "payroll_runs"("entityId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_lines_runId_structureId_key" ON "payroll_lines"("runId", "structureId");

-- AddForeignKey
ALTER TABLE "payroll_structures" ADD CONSTRAINT "payroll_structures_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_structures" ADD CONSTRAINT "payroll_structures_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_runId_fkey" FOREIGN KEY ("runId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_structureId_fkey" FOREIGN KEY ("structureId") REFERENCES "payroll_structures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

