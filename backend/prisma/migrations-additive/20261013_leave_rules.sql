-- ASA Portal additive migration: firm work calendar + leave rules (13 Oct 2026)
-- Creates 4 NEW tables only (firm_settings, leave_types, leave_type_balances, leave_ledger). No existing table or column is altered or dropped.
-- Apply: npx prisma db execute --file prisma/migrations-additive/20261013_leave_rules.sql --schema prisma/schema.prisma

-- CreateTable
CREATE TABLE "firm_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "leaveYearStartMonth" INTEGER NOT NULL DEFAULT 1,
    "saturdaysOff" TEXT NOT NULL DEFAULT 'all',
    "sundayOff" BOOLEAN NOT NULL DEFAULT true,
    "leaveAccrualFrom" DATE,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "firm_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "annualDays" DOUBLE PRECISION,
    "accrual" TEXT NOT NULL DEFAULT 'yearly',
    "prorateOnJoining" BOOLEAN NOT NULL DEFAULT true,
    "carryForwardMax" DOUBLE PRECISION,
    "encashable" BOOLEAN NOT NULL DEFAULT false,
    "encashMax" DOUBLE PRECISION,
    "allowNegative" BOOLEAN NOT NULL DEFAULT false,
    "allowHalfDay" BOOLEAN NOT NULL DEFAULT true,
    "countNonWorkingDays" BOOLEAN NOT NULL DEFAULT false,
    "minServiceDays" INTEGER NOT NULL DEFAULT 0,
    "maxPerRequest" DOUBLE PRECISION,
    "noticeDays" INTEGER NOT NULL DEFAULT 0,
    "gender" TEXT NOT NULL DEFAULT 'all',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_type_balances" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "opening" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "adjusted" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "encashed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lapsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "closedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_type_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_ledger" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "days" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_code_key" ON "leave_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_name_key" ON "leave_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "leave_type_balances_employeeId_leaveTypeId_year_key" ON "leave_type_balances"("employeeId", "leaveTypeId", "year");

-- CreateIndex
CREATE INDEX "leave_ledger_employeeId_year_idx" ON "leave_ledger"("employeeId", "year");

-- AddForeignKey
ALTER TABLE "leave_type_balances" ADD CONSTRAINT "leave_type_balances_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_type_balances" ADD CONSTRAINT "leave_type_balances_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_ledger" ADD CONSTRAINT "leave_ledger_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_ledger" ADD CONSTRAINT "leave_ledger_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

