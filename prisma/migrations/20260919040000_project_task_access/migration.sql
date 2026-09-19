-- Temporary members: per-task view / add-memo grants (not ProjectMember)

CREATE TABLE "ProjectTaskAccess" (
    "id" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT true,
    "canAddMemo" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "ProjectTaskAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectTaskAccess_taskId_userId_key" ON "ProjectTaskAccess"("taskId", "userId");
CREATE INDEX "ProjectTaskAccess_userId_idx" ON "ProjectTaskAccess"("userId");
CREATE INDEX "ProjectTaskAccess_projectId_userId_idx" ON "ProjectTaskAccess"("projectId", "userId");
CREATE INDEX "ProjectTaskAccess_expiresAt_idx" ON "ProjectTaskAccess"("expiresAt");

ALTER TABLE "ProjectTaskAccess"
  ADD CONSTRAINT "ProjectTaskAccess_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectTaskAccess"
  ADD CONSTRAINT "ProjectTaskAccess_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "ProjectTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectTaskAccess"
  ADD CONSTRAINT "ProjectTaskAccess_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectTaskAccess"
  ADD CONSTRAINT "ProjectTaskAccess_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
