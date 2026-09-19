-- Short keyword/content field separate from long note on ledger records
ALTER TABLE "Record" ADD COLUMN IF NOT EXISTS "content" TEXT;
ALTER TABLE "PrivateRecord" ADD COLUMN IF NOT EXISTS "content" TEXT;
