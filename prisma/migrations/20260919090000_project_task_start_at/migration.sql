-- Optional schedule start on project tasks (dueDate remains end / deadline)

ALTER TABLE "ProjectTask" ADD COLUMN IF NOT EXISTS "startAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "ProjectTask_projectId_startAt_idx"
  ON "ProjectTask"("projectId", "startAt");
