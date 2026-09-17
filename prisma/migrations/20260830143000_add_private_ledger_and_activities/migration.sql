-- Add permission fields for public ledger access and private ledger visibility.
ALTER TABLE "User"
  ADD COLUMN "publicLedgerRole" TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN "privateLedgerVisibility" TEXT NOT NULL DEFAULT 'PRIVATE';

-- Add private ledger records.
CREATE TABLE "PrivateRecord" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "note" TEXT,
  "amount" DOUBLE PRECISION NOT NULL,
  "attachmentUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "userId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "subCategoryId" TEXT,
  "thirdCategoryId" TEXT,

  CONSTRAINT "PrivateRecord_pkey" PRIMARY KEY ("id")
);

-- Add activities with reminders and visibility.
CREATE TABLE "Activity" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "note" TEXT,
  "eventDate" TIMESTAMP(3) NOT NULL,
  "reminderDays" INTEGER NOT NULL DEFAULT 15,
  "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "userId" TEXT NOT NULL,

  CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- Extend attachments so they can be linked to private ledger records and activities.
ALTER TABLE "Attachment"
  ADD COLUMN "privateRecordId" TEXT,
  ADD COLUMN "activityId" TEXT;

ALTER TABLE "PrivateRecord"
  ADD CONSTRAINT "PrivateRecord_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PrivateRecord"
  ADD CONSTRAINT "PrivateRecord_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PrivateRecord"
  ADD CONSTRAINT "PrivateRecord_subCategoryId_fkey"
  FOREIGN KEY ("subCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PrivateRecord"
  ADD CONSTRAINT "PrivateRecord_thirdCategoryId_fkey"
  FOREIGN KEY ("thirdCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Activity"
  ADD CONSTRAINT "Activity_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Attachment"
  ADD CONSTRAINT "Attachment_privateRecordId_fkey"
  FOREIGN KEY ("privateRecordId") REFERENCES "PrivateRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Attachment"
  ADD CONSTRAINT "Attachment_activityId_fkey"
  FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
