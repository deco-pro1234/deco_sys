-- Multi-assignee for project tasks + attachments on memos

CREATE TABLE "ProjectTaskAssignee" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "ProjectTaskAssignee_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectTaskAssignee_taskId_userId_key" ON "ProjectTaskAssignee"("taskId", "userId");
CREATE INDEX "ProjectTaskAssignee_userId_idx" ON "ProjectTaskAssignee"("userId");

ALTER TABLE "ProjectTaskAssignee"
  ADD CONSTRAINT "ProjectTaskAssignee_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "ProjectTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectTaskAssignee"
  ADD CONSTRAINT "ProjectTaskAssignee_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill from legacy single assigneeId
INSERT INTO "ProjectTaskAssignee" ("id", "createdAt", "taskId", "userId")
SELECT t."id" || '-legacy-assignee', CURRENT_TIMESTAMP, t."id", t."assigneeId"
FROM "ProjectTask" t
WHERE t."assigneeId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "ProjectTaskAssignee" a
    WHERE a."taskId" = t."id" AND a."userId" = t."assigneeId"
  );

ALTER TABLE "Attachment" ADD COLUMN IF NOT EXISTS "memoId" TEXT;

DO $$ BEGIN
  ALTER TABLE "Attachment"
    ADD CONSTRAINT "Attachment_memoId_fkey"
    FOREIGN KEY ("memoId") REFERENCES "Memo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
