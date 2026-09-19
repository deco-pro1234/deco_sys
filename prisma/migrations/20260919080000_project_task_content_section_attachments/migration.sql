-- Task body content; section description; section-level attachments

ALTER TABLE "ProjectTask" ADD COLUMN IF NOT EXISTS "content" TEXT;

ALTER TABLE "ProjectSection" ADD COLUMN IF NOT EXISTS "description" TEXT;

ALTER TABLE "Attachment" ADD COLUMN IF NOT EXISTS "projectSectionId" TEXT;

CREATE INDEX IF NOT EXISTS "Attachment_projectSectionId_idx" ON "Attachment"("projectSectionId");
CREATE INDEX IF NOT EXISTS "Attachment_projectTaskId_idx" ON "Attachment"("projectTaskId");

DO $$ BEGIN
  ALTER TABLE "Attachment"
    ADD CONSTRAINT "Attachment_projectSectionId_fkey"
    FOREIGN KEY ("projectSectionId") REFERENCES "ProjectSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
