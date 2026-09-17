-- Add third-level categories for records, contracts, memo history, and reusable attachments.

ALTER TABLE "Record"
  ADD COLUMN "thirdCategoryId" TEXT;

ALTER TABLE "Attachment"
  ADD COLUMN "note" TEXT,
  ADD COLUMN "recordId" TEXT,
  ADD COLUMN "contractId" TEXT;

CREATE TABLE "Contract" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "effectiveDate" TIMESTAMP(3) NOT NULL,
  "expiryDate" TIMESTAMP(3) NOT NULL,
  "note" TEXT,
  "amount" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "userId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "subCategoryId" TEXT,
  "thirdCategoryId" TEXT,
  "poolId" TEXT,

  CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Memo" (
  "id" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "authorId" TEXT NOT NULL,
  "recordId" TEXT,
  "contractId" TEXT,

  CONSTRAINT "Memo_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Record"
  ADD CONSTRAINT "Record_thirdCategoryId_fkey"
  FOREIGN KEY ("thirdCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Attachment"
  ADD CONSTRAINT "Attachment_recordId_fkey"
  FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Attachment"
  ADD CONSTRAINT "Attachment_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Contract"
  ADD CONSTRAINT "Contract_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Contract"
  ADD CONSTRAINT "Contract_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Contract"
  ADD CONSTRAINT "Contract_subCategoryId_fkey"
  FOREIGN KEY ("subCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Contract"
  ADD CONSTRAINT "Contract_thirdCategoryId_fkey"
  FOREIGN KEY ("thirdCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Contract"
  ADD CONSTRAINT "Contract_poolId_fkey"
  FOREIGN KEY ("poolId") REFERENCES "CapitalPool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Memo"
  ADD CONSTRAINT "Memo_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Memo"
  ADD CONSTRAINT "Memo_recordId_fkey"
  FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Memo"
  ADD CONSTRAINT "Memo_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
