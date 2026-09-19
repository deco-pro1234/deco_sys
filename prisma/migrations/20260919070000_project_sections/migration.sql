-- Two-level project sections (root → child) with optional task.sectionId

CREATE TABLE "ProjectSection" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,

    CONSTRAINT "ProjectSection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectSection_projectId_parentId_sortOrder_idx"
  ON "ProjectSection"("projectId", "parentId", "sortOrder");

ALTER TABLE "ProjectSection"
  ADD CONSTRAINT "ProjectSection_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectSection"
  ADD CONSTRAINT "ProjectSection_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "ProjectSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectTask" ADD COLUMN IF NOT EXISTS "sectionId" TEXT;

CREATE INDEX IF NOT EXISTS "ProjectTask_sectionId_idx" ON "ProjectTask"("sectionId");

DO $$ BEGIN
  ALTER TABLE "ProjectTask"
    ADD CONSTRAINT "ProjectTask_sectionId_fkey"
    FOREIGN KEY ("sectionId") REFERENCES "ProjectSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
