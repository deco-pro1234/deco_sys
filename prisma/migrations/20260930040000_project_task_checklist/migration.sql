-- Project / task checklist items + task completedAt

ALTER TABLE "ProjectTask" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "ProjectChecklistItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "ProjectChecklistItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProjectTaskChecklistItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectTaskId" TEXT NOT NULL,

    CONSTRAINT "ProjectTaskChecklistItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProjectChecklistItem_projectId_sortOrder_idx"
  ON "ProjectChecklistItem"("projectId", "sortOrder");

CREATE INDEX IF NOT EXISTS "ProjectTaskChecklistItem_projectTaskId_sortOrder_idx"
  ON "ProjectTaskChecklistItem"("projectTaskId", "sortOrder");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProjectChecklistItem_projectId_fkey'
  ) THEN
    ALTER TABLE "ProjectChecklistItem"
      ADD CONSTRAINT "ProjectChecklistItem_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProjectTaskChecklistItem_projectTaskId_fkey'
  ) THEN
    ALTER TABLE "ProjectTaskChecklistItem"
      ADD CONSTRAINT "ProjectTaskChecklistItem_projectTaskId_fkey"
      FOREIGN KEY ("projectTaskId") REFERENCES "ProjectTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
