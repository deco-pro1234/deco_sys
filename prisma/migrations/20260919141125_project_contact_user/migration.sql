-- Project contact person (optional)
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "contactUserId" TEXT;

CREATE INDEX IF NOT EXISTS "Project_contactUserId_idx" ON "Project"("contactUserId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Project_contactUserId_fkey'
  ) THEN
    ALTER TABLE "Project"
      ADD CONSTRAINT "Project_contactUserId_fkey"
      FOREIGN KEY ("contactUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
