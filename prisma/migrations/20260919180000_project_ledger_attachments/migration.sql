-- Project ledger entry attachments (receipts / invoices)

ALTER TABLE "Attachment" ADD COLUMN IF NOT EXISTS "projectLedgerEntryId" TEXT;

CREATE INDEX IF NOT EXISTS "Attachment_projectLedgerEntryId_idx" ON "Attachment"("projectLedgerEntryId");

DO $$ BEGIN
  ALTER TABLE "Attachment"
    ADD CONSTRAINT "Attachment_projectLedgerEntryId_fkey"
    FOREIGN KEY ("projectLedgerEntryId") REFERENCES "ProjectLedgerEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
