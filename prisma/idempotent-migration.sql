-- Idempotent SQL for mobile-ux changes (safe to re-run if partially applied).
-- Wrapped in anonymous DO blocks so each step is skipped if the column/table already exists.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'User' AND column_name = 'ocrEnabled'
  ) THEN
    ALTER TABLE "User" ADD COLUMN "ocrEnabled" BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'PrivateRecord' AND column_name = 'customCategory'
  ) THEN
    ALTER TABLE "PrivateRecord" ADD COLUMN "customCategory" TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Contract' AND column_name = 'reminderDays'
  ) THEN
    ALTER TABLE "Contract" ADD COLUMN "reminderDays" INTEGER NOT NULL DEFAULT 15;
  END IF;
END $$;

DO $$
DECLARE
  col_is_not_null BOOLEAN;
BEGIN
  SELECT (is_nullable = 'NO') INTO col_is_not_null
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'Contract' AND column_name = 'categoryId';

  IF col_is_not_null THEN
    ALTER TABLE "Contract" ALTER COLUMN "categoryId" DROP NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'SystemSetting'
  ) THEN
    CREATE TABLE "SystemSetting" (
      "id" TEXT NOT NULL,
      "key" TEXT NOT NULL,
      "value" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX "SystemSetting_key_key" ON "SystemSetting"("key");
  END IF;
END $$;
