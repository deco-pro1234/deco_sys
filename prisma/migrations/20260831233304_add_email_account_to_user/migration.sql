-- ============================================================
-- Migration: add_email_account_to_user
-- Purpose:
--   1. Add `email` (login account, required, unique) to User
--   2. Add emailVerified + verificationToken + 2 timestamp columns
--   3. Drop the old unique index on `password` (passwords must not be unique)
-- Safety:
--   - All DDL uses IF NOT EXISTS / DO $$ exception blocks so the migration
--     is idempotent (safe to re-run if a deploy fails halfway).
--   - Legacy users (created before this migration) have their email
--     back-filled with a deterministic placeholder so the NOT NULL +
--     UNIQUE constraints can be applied without row errors. Those legacy
--     accounts CANNOT log in via the new dual-field flow (matches the
--     product decision to forcibly retire old password-only accounts)
--     but the DB schema still stays consistent.
-- ============================================================

-- 1. Add new nullable columns (idempotent)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "verificationToken" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "verificationTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "verificationSentAt" TIMESTAMP(3);

-- 2. Back-fill placeholder email for rows that still have NULL email
--    Placeholder format: migrated-<uuid-first-12>@localhost.local
--    After back-fill, every row has a DISTINCT value, so UNIQUE can be added.
DO $$
DECLARE
    r RECORD;
    placeholder TEXT;
BEGIN
    FOR r IN SELECT "id" FROM "User" WHERE "email" IS NULL LOOP
        placeholder := 'migrated-' || substr(replace(r.id, '-', ''), 1, 12) || '@localhost.local';
        UPDATE "User" SET "email" = placeholder WHERE "id" = r.id AND "email" IS NULL;
    END LOOP;
END $$;

-- 3. Now make email NOT NULL (every row is guaranteed to have a value)
DO $$ BEGIN
    ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;

-- 4. Create the UNIQUE index on email (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

-- 5. Drop the old UNIQUE index on password (passwords must NOT force uniqueness)
DROP INDEX IF EXISTS "User_password_key";
