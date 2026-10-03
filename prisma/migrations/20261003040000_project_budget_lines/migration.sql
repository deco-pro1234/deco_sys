-- Project budget lines (planned income/expense; separate from actual ledger)

CREATE TABLE IF NOT EXISTS "ProjectBudgetLine" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "title" TEXT,
    "note" TEXT,
    "date" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "ProjectBudgetLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProjectBudgetLine_projectId_type_sortOrder_idx"
  ON "ProjectBudgetLine"("projectId", "type", "sortOrder");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProjectBudgetLine_projectId_fkey'
  ) THEN
    ALTER TABLE "ProjectBudgetLine"
      ADD CONSTRAINT "ProjectBudgetLine_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProjectBudgetLine_createdById_fkey'
  ) THEN
    ALTER TABLE "ProjectBudgetLine"
      ADD CONSTRAINT "ProjectBudgetLine_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
