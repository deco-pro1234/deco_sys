-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "SalaryCycleStatus" AS ENUM ('OPEN', 'LOCKED', 'SETTLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SalaryCycleType" AS ENUM ('MONTHLY', 'SEMI_MONTHLY', 'WEEKLY', 'BI_WEEKLY', 'ONE_OFF');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'CONFIRMED', 'PAID', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterTable (Attachment: add payroll FKs, must be unique because of 1:1 relation)
ALTER TABLE "Attachment" ADD COLUMN IF NOT EXISTS "payrollPaidId" TEXT;
ALTER TABLE "Attachment" ADD COLUMN IF NOT EXISTS "payrollPdfId" TEXT;

-- Ensure unique indices for the 1:1 FKs (do not fail if already exist on some envs)
CREATE UNIQUE INDEX IF NOT EXISTS "Attachment_payrollPaidId_key" ON "Attachment"("payrollPaidId");
CREATE UNIQUE INDEX IF NOT EXISTS "Attachment_payrollPdfId_key" ON "Attachment"("payrollPdfId");

-- CreateTable: UserProfile (1:1 -> User)
CREATE TABLE IF NOT EXISTS "UserProfile" (
    "userId" TEXT NOT NULL,
    "legalNameEn" TEXT NOT NULL,
    "legalNameZh" TEXT,
    "hkid" TEXT,
    "passportNo" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "jobTitle" TEXT,
    "department" TEXT,
    "dateJoined" TIMESTAMP(3),
    "dateOfTermination" TIMESTAMP(3),
    "defaultBaseSalaryHkd" DOUBLE PRECISION DEFAULT 0,
    "bankName" TEXT,
    "bankAccountNo" TEXT,
    "mpfAccountNo" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "emergencyName" TEXT,
    "emergencyPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable: SalaryCycle
CREATE TABLE IF NOT EXISTS "SalaryCycle" (
    "id" TEXT NOT NULL,
    "cycleType" "SalaryCycleType" NOT NULL DEFAULT 'MONTHLY',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "payrollDate" TIMESTAMP(3) NOT NULL,
    "status" "SalaryCycleStatus" NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "headcountTotal" INTEGER NOT NULL DEFAULT 0,
    "headcountConfirmed" INTEGER NOT NULL DEFAULT 0,
    "headcountPaid" INTEGER NOT NULL DEFAULT 0,
    "grossTotalHkd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deductionTotalHkd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netPayableTotalHkd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amountPaidTotalHkd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Payroll
CREATE TABLE IF NOT EXISTS "Payroll" (
    "id" TEXT NOT NULL,
    "salaryCycleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "snapshotProfileJson" JSONB NOT NULL,
    "baseSalaryHkd" DOUBLE PRECISION NOT NULL,
    "overtimeHkd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bonusHkd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commissionHkd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "allowanceTotalHkd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deductionTotalHkd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grossTotalHkd" DOUBLE PRECISION NOT NULL,
    "netPayableHkd" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'HKD',
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "adminNote" TEXT,
    "employeeNote" TEXT,
    "submittedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "revisedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "submittedByUserId" TEXT,
    "paidByUserId" TEXT,
    "paidReference" TEXT,
    "paidAttachmentId" TEXT,
    "pdfGeneratedAt" TIMESTAMP(3),
    "pdfAttachmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payroll_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PayrollItem
CREATE TABLE IF NOT EXISTS "PayrollItem" (
    "id" TEXT NOT NULL,
    "payrollId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "sourceText" TEXT,
    "unitCount" DOUBLE PRECISION,
    "unitRateHkd" DOUBLE PRECISION,
    "amountHkd" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollItem_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "UserProfile"
    ADD CONSTRAINT "UserProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "SalaryCycle"
    ADD CONSTRAINT "SalaryCycle_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Payroll"
    ADD CONSTRAINT "Payroll_salaryCycleId_fkey"
    FOREIGN KEY ("salaryCycleId") REFERENCES "SalaryCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Payroll"
    ADD CONSTRAINT "Payroll_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Payroll"
    ADD CONSTRAINT "Payroll_submittedByUserId_fkey"
    FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Payroll"
    ADD CONSTRAINT "Payroll_paidByUserId_fkey"
    FOREIGN KEY ("paidByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Attachment"
    ADD CONSTRAINT "Attachment_payrollPaidId_fkey"
    FOREIGN KEY ("payrollPaidId") REFERENCES "Payroll"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Attachment"
    ADD CONSTRAINT "Attachment_payrollPdfId_fkey"
    FOREIGN KEY ("payrollPdfId") REFERENCES "Payroll"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PayrollItem"
    ADD CONSTRAINT "PayrollItem_payrollId_fkey"
    FOREIGN KEY ("payrollId") REFERENCES "Payroll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Create Indices
CREATE INDEX IF NOT EXISTS "SalaryCycle_createdByUserId_idx" ON "SalaryCycle"("createdByUserId");
CREATE INDEX IF NOT EXISTS "SalaryCycle_status_idx" ON "SalaryCycle"("status");
CREATE INDEX IF NOT EXISTS "SalaryCycle_periodStart_periodEnd_idx" ON "SalaryCycle"("periodStart", "periodEnd");

CREATE INDEX IF NOT EXISTS "Payroll_salaryCycleId_idx" ON "Payroll"("salaryCycleId");
CREATE INDEX IF NOT EXISTS "Payroll_userId_idx" ON "Payroll"("userId");
CREATE INDEX IF NOT EXISTS "Payroll_status_idx" ON "Payroll"("status");
CREATE INDEX IF NOT EXISTS "Payroll_paidAt_idx" ON "Payroll"("paidAt");
CREATE UNIQUE INDEX IF NOT EXISTS "Payroll_paidAttachmentId_key" ON "Payroll"("paidAttachmentId");
CREATE UNIQUE INDEX IF NOT EXISTS "Payroll_pdfAttachmentId_key" ON "Payroll"("pdfAttachmentId");

CREATE INDEX IF NOT EXISTS "PayrollItem_payrollId_idx" ON "PayrollItem"("payrollId");
CREATE INDEX IF NOT EXISTS "PayrollItem_itemType_idx" ON "PayrollItem"("itemType");
CREATE INDEX IF NOT EXISTS "PayrollItem_itemCode_idx" ON "PayrollItem"("itemCode");

CREATE INDEX IF NOT EXISTS "UserProfile_department_idx" ON "UserProfile"("department");
CREATE INDEX IF NOT EXISTS "UserProfile_jobTitle_idx" ON "UserProfile"("jobTitle");
