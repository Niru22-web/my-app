-- ASA Portal additive migration (15 Oct 2026): accounts numbering/credit notes/TDS/bank matches, timesheet lock,
-- attendance policy + missed-punch requests, expense policies, exit workflow, HR document checklist.
-- Creates 13 NEW tables; no existing table is altered (the one ALTER links exit_tasks to the new employee_exits).
-- Apply: npx prisma db execute --file prisma/migrations-additive/20261015_ops_and_accounts.sql --schema prisma/schema.prisma

-- CreateTable
CREATE TABLE "doc_series" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "fy" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doc_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_meta" (
    "invoiceId" TEXT NOT NULL,
    "placeOfSupply" TEXT,
    "supplyType" TEXT NOT NULL,
    "draftNumber" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "issuedById" TEXT NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelReason" TEXT,

    CONSTRAINT "invoice_meta_pkey" PRIMARY KEY ("invoiceId")
);

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "subTotal" DOUBLE PRECISION NOT NULL,
    "cgst" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sgst" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igst" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_extra" (
    "receiptId" TEXT NOT NULL,
    "tdsAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tdsSection" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversedById" TEXT,
    "reverseReason" TEXT,

    CONSTRAINT "receipt_extra_pkey" PRIMARY KEY ("receiptId")
);

-- CreateTable
CREATE TABLE "bank_match" (
    "transactionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "receiptId" TEXT,
    "payrollId" TEXT,
    "claimId" TEXT,
    "matchedById" TEXT NOT NULL,
    "matchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_match_pkey" PRIMARY KEY ("transactionId")
);

-- CreateTable
CREATE TABLE "timesheet_lock" (
    "id" TEXT NOT NULL,
    "lockedThrough" DATE NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timesheet_lock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_policy" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "graceMinutes" INTEGER NOT NULL DEFAULT 15,
    "fullDayMinHours" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "halfDayMinHours" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "regularizeWithinDays" INTEGER NOT NULL DEFAULT 7,
    "regularizeMonthlyLimit" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "attendance_policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_regularizations" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_regularizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_policies" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "perClaimLimit" DOUBLE PRECISION,
    "monthlyLimit" DOUBLE PRECISION,
    "receiptRequiredAbove" DOUBLE PRECISION,
    "submitWithinDays" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "expense_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_exits" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "exitType" TEXT NOT NULL DEFAULT 'Resignation',
    "resignationDate" DATE NOT NULL,
    "lastWorkingDay" DATE NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'INITIATED',
    "initiatedById" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_exits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exit_tasks" (
    "id" TEXT NOT NULL,
    "exitId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneById" TEXT,
    "doneAt" TIMESTAMP(3),
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "exit_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_requirements" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_document_checks" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "documentId" TEXT,
    "note" TEXT,
    "checkedById" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_document_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "doc_series_entityId_docType_fy_key" ON "doc_series"("entityId", "docType", "fy");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_number_key" ON "credit_notes"("number");

-- CreateIndex
CREATE INDEX "credit_notes_invoiceId_idx" ON "credit_notes"("invoiceId");

-- CreateIndex
CREATE INDEX "credit_notes_clientId_idx" ON "credit_notes"("clientId");

-- CreateIndex
CREATE INDEX "attendance_regularizations_employeeId_date_idx" ON "attendance_regularizations"("employeeId", "date");

-- CreateIndex
CREATE INDEX "attendance_regularizations_status_idx" ON "attendance_regularizations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "expense_policies_category_key" ON "expense_policies"("category");

-- CreateIndex
CREATE UNIQUE INDEX "employee_exits_employeeId_key" ON "employee_exits"("employeeId");

-- CreateIndex
CREATE INDEX "exit_tasks_exitId_idx" ON "exit_tasks"("exitId");

-- CreateIndex
CREATE UNIQUE INDEX "document_requirements_name_key" ON "document_requirements"("name");

-- CreateIndex
CREATE UNIQUE INDEX "employee_document_checks_employeeId_requirementId_key" ON "employee_document_checks"("employeeId", "requirementId");

-- AddForeignKey
ALTER TABLE "exit_tasks" ADD CONSTRAINT "exit_tasks_exitId_fkey" FOREIGN KEY ("exitId") REFERENCES "employee_exits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

