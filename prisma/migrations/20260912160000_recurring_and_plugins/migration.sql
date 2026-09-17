-- Recurring ledger templates & instances
CREATE TABLE IF NOT EXISTS "RecurringTemplate" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "intervalMonths" INTEGER NOT NULL DEFAULT 1,
    "dayOfMonth" INTEGER NOT NULL,
    "nextDueDate" TIMESTAMP(3) NOT NULL,
    "reminderDays" INTEGER NOT NULL DEFAULT 15,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "subCategoryId" TEXT,
    "thirdCategoryId" TEXT,
    "poolId" TEXT,
    "sourceContractId" TEXT,
    CONSTRAINT "RecurringTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RecurringInstance" (
    "id" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "amount" DOUBLE PRECISION,
    "note" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "templateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "RecurringInstance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RecurringInstance_templateId_dueDate_key" ON "RecurringInstance"("templateId", "dueDate");
CREATE INDEX IF NOT EXISTS "RecurringInstance_status_dueDate_idx" ON "RecurringInstance"("status", "dueDate");

ALTER TABLE "Attachment" ADD COLUMN IF NOT EXISTS "recurringInstanceId" TEXT;

ALTER TABLE "RecurringTemplate" ADD CONSTRAINT "RecurringTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringTemplate" ADD CONSTRAINT "RecurringTemplate_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringTemplate" ADD CONSTRAINT "RecurringTemplate_subCategoryId_fkey" FOREIGN KEY ("subCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecurringTemplate" ADD CONSTRAINT "RecurringTemplate_thirdCategoryId_fkey" FOREIGN KEY ("thirdCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecurringTemplate" ADD CONSTRAINT "RecurringTemplate_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "CapitalPool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RecurringInstance" ADD CONSTRAINT "RecurringInstance_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "RecurringTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecurringInstance" ADD CONSTRAINT "RecurringInstance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$ BEGIN
  ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_recurringInstanceId_fkey" FOREIGN KEY ("recurringInstanceId") REFERENCES "RecurringInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
