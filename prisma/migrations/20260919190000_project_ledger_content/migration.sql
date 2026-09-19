-- Short keyword/content field for project ledger (aligned with Record / PrivateRecord OCR)
ALTER TABLE "ProjectLedgerEntry" ADD COLUMN IF NOT EXISTS "content" TEXT;
