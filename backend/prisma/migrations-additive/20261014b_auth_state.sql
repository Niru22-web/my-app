-- ASA Portal additive migration: session revocation (14 Oct 2026). Creates 1 NEW table; nothing existing is altered.

-- CreateTable
CREATE TABLE "auth_state" (
    "employeeId" TEXT NOT NULL,
    "tokensValidAfter" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_state_pkey" PRIMARY KEY ("employeeId")
);

