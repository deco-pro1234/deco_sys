-- Align remaining columns with prisma/schema.prisma for fresh PostgreSQL deploys.
-- Idempotent where possible so partially migrated DBs can recover.

-- Category.type
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'EXPENSE';

-- CapitalPool.isReviewRequired
ALTER TABLE "CapitalPool" ADD COLUMN IF NOT EXISTS "isReviewRequired" BOOLEAN NOT NULL DEFAULT false;

-- Record review / modify-in-review fields
ALTER TABLE "Record" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'APPROVED';
ALTER TABLE "Record" ADD COLUMN IF NOT EXISTS "originalRecordId" TEXT;
ALTER TABLE "Record" ADD COLUMN IF NOT EXISTS "isReviewing" BOOLEAN NOT NULL DEFAULT false;

-- Record.poolId optional (schema: String?)
DO $$ BEGIN
  ALTER TABLE "Record" ALTER COLUMN "poolId" DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Soft FK for modify-in-review chain (ignore if already exists)
DO $$ BEGIN
  ALTER TABLE "Record"
    ADD CONSTRAINT "Record_originalRecordId_fkey"
    FOREIGN KEY ("originalRecordId") REFERENCES "Record"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
