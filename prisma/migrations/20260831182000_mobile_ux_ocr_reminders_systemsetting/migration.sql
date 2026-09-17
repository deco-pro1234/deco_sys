-- Add ocrEnabled flag to enable/disable OCR per user.
ALTER TABLE "User"
  ADD COLUMN "ocrEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Add customCategory for free-text category on private records.
ALTER TABLE "PrivateRecord"
  ADD COLUMN "customCategory" TEXT;

-- Add reminderDays for contract expiry reminders.
ALTER TABLE "Contract"
  ADD COLUMN "reminderDays" INTEGER NOT NULL DEFAULT 15;

-- Make Contract.categoryId nullable (category is no longer required).
ALTER TABLE "Contract"
  ALTER COLUMN "categoryId" DROP NOT NULL;

-- Add SystemSetting table for arbitrary key/value system-wide settings.
CREATE TABLE "SystemSetting" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SystemSetting_key_key" ON "SystemSetting"("key");
