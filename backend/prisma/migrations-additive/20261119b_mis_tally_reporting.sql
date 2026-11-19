-- ASA Portal additive migration (19 Nov 2026): ASA MIS features — reporting dimensions, Tally vouchers/ledgers,
-- Tally party links, load log and historical vertical-MIS snapshots.
-- Creates 7 NEW tables and seeds tally_group_heads with the standard Tally primary groups (from ASA MIS).
-- No existing table or column is altered. Safe to re-run the seed (ON CONFLICT DO NOTHING).
-- Apply: npx prisma db execute --file prisma/migrations-additive/20261119b_mis_tally_reporting.sql --schema prisma/schema.prisma

-- CreateTable
CREATE TABLE "reporting_map" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "reportingClientName" TEXT,
    "serviceCategory" TEXT,
    "verticalHead" TEXT,
    "engagementPartner" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reporting_map_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tally_vouchers" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "register" TEXT NOT NULL,
    "rowKey" TEXT NOT NULL,
    "date" DATE,
    "particulars" TEXT,
    "voucherType" TEXT,
    "voucherNo" TEXT,
    "narration" TEXT,
    "grossTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ledger" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "loadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tally_vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tally_ledgers" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "ledgerName" TEXT NOT NULL,
    "parent" TEXT,
    "primaryGroup" TEXT,
    "openingBalance" DOUBLE PRECISION,
    "closingBalance" DOUBLE PRECISION,
    "loadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tally_ledgers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tally_group_heads" (
    "primaryGroup" TEXT NOT NULL,
    "head" TEXT NOT NULL,

    CONSTRAINT "tally_group_heads_pkey" PRIMARY KEY ("primaryGroup")
);

-- CreateTable
CREATE TABLE "tally_load_logs" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "register" TEXT NOT NULL,
    "sourceFile" TEXT,
    "vouchers" INTEGER NOT NULL DEFAULT 0,
    "rows" INTEGER NOT NULL DEFAULT 0,
    "tallyGrandTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "outputTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "difference" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "loadedById" TEXT,
    "loadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tally_load_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tally_party_links" (
    "id" TEXT NOT NULL,
    "tallyName" TEXT NOT NULL,
    "employeeId" TEXT,
    "category" TEXT NOT NULL DEFAULT 'Employee',
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tally_party_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mis_snapshots" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "uploadedById" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mis_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reporting_map_projectId_idx" ON "reporting_map"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "reporting_map_clientId_projectId_key" ON "reporting_map"("clientId", "projectId");

-- CreateIndex
CREATE INDEX "tally_vouchers_entityId_date_idx" ON "tally_vouchers"("entityId", "date");

-- CreateIndex
CREATE INDEX "tally_vouchers_entityId_register_idx" ON "tally_vouchers"("entityId", "register");

-- CreateIndex
CREATE UNIQUE INDEX "tally_vouchers_entityId_rowKey_key" ON "tally_vouchers"("entityId", "rowKey");

-- CreateIndex
CREATE UNIQUE INDEX "tally_ledgers_entityId_ledgerName_key" ON "tally_ledgers"("entityId", "ledgerName");

-- CreateIndex
CREATE UNIQUE INDEX "tally_load_logs_entityId_register_key" ON "tally_load_logs"("entityId", "register");

-- CreateIndex
CREATE UNIQUE INDEX "tally_party_links_tallyName_key" ON "tally_party_links"("tallyName");

-- CreateIndex
CREATE INDEX "tally_party_links_employeeId_idx" ON "tally_party_links"("employeeId");

-- AddForeignKey
ALTER TABLE "reporting_map" ADD CONSTRAINT "reporting_map_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporting_map" ADD CONSTRAINT "reporting_map_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tally_vouchers" ADD CONSTRAINT "tally_vouchers_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tally_ledgers" ADD CONSTRAINT "tally_ledgers_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tally_load_logs" ADD CONSTRAINT "tally_load_logs_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tally_party_links" ADD CONSTRAINT "tally_party_links_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Seed: Tally primary group -> P&L head (ASA MIS db/schema.sql group_head_map)
INSERT INTO "tally_group_heads" ("primaryGroup", "head") VALUES
    ('Sales Accounts', 'Revenue'), ('Direct Incomes', 'Revenue'), ('Indirect Incomes', 'Revenue'),
    ('Direct Expenses', 'Expense'), ('Indirect Expenses', 'Expense'), ('Purchase Accounts', 'Expense'),
    ('Duties & Taxes', 'Tax'), ('Suspense A/c', 'Suspense'),
    ('Sundry Debtors', 'Balance Sheet'), ('Sundry Creditors', 'Balance Sheet'), ('Fixed Assets', 'Balance Sheet'),
    ('Investments', 'Balance Sheet'), ('Current Assets', 'Balance Sheet'), ('Current Liabilities', 'Balance Sheet'),
    ('Loans & Advances (Asset)', 'Balance Sheet'), ('Unsecured Loans', 'Balance Sheet'), ('Loans (Liability)', 'Balance Sheet'),
    ('Secured Loans', 'Balance Sheet'), ('Bank Accounts', 'Balance Sheet'), ('Bank OD A/c', 'Balance Sheet'),
    ('Deposits (Asset)', 'Balance Sheet'), ('Capital Account', 'Balance Sheet'), ('Cash-in-Hand', 'Balance Sheet'),
    ('Provisions', 'Balance Sheet'), ('Branch / Divisions', 'Balance Sheet'), ('Stock-in-Hand', 'Balance Sheet'),
    ('Reserves & Surplus', 'Balance Sheet')
ON CONFLICT ("primaryGroup") DO NOTHING;
