-- Section-scoped temporary access; migrate legacy task grants into owning sections

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE "ProjectSectionAccess" (
    "id" TEXT NOT NULL,
    "canAddMemo" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "sectionId" TEXT,
    "scopeKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "ProjectSectionAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectSectionAccess_projectId_userId_scopeKey_key"
  ON "ProjectSectionAccess"("projectId", "userId", "scopeKey");

CREATE INDEX "ProjectSectionAccess_userId_idx" ON "ProjectSectionAccess"("userId");
CREATE INDEX "ProjectSectionAccess_projectId_userId_idx" ON "ProjectSectionAccess"("projectId", "userId");
CREATE INDEX "ProjectSectionAccess_expiresAt_idx" ON "ProjectSectionAccess"("expiresAt");

ALTER TABLE "ProjectSectionAccess"
  ADD CONSTRAINT "ProjectSectionAccess_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectSectionAccess"
  ADD CONSTRAINT "ProjectSectionAccess_sectionId_fkey"
  FOREIGN KEY ("sectionId") REFERENCES "ProjectSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectSectionAccess"
  ADD CONSTRAINT "ProjectSectionAccess_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectSectionAccess"
  ADD CONSTRAINT "ProjectSectionAccess_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Migrate: group task grants by project+user+owning section (or uncategorized)
INSERT INTO "ProjectSectionAccess" (
  "id", "canAddMemo", "expiresAt", "createdAt", "updatedAt",
  "projectId", "sectionId", "scopeKey", "userId", "createdById"
)
SELECT
  gen_random_uuid()::text,
  BOOL_OR(a."canAddMemo"),
  MAX(a."expiresAt"),
  NOW(),
  NOW(),
  a."projectId",
  t."sectionId",
  COALESCE(t."sectionId", '__uncategorized__'),
  a."userId",
  (ARRAY_AGG(a."createdById" ORDER BY a."createdAt" ASC))[1]
FROM "ProjectTaskAccess" a
JOIN "ProjectTask" t ON t."id" = a."taskId"
WHERE a."canView" = true OR a."canAddMemo" = true
GROUP BY a."projectId", a."userId", t."sectionId"
ON CONFLICT ("projectId", "userId", "scopeKey") DO UPDATE SET
  "canAddMemo" = "ProjectSectionAccess"."canAddMemo" OR EXCLUDED."canAddMemo",
  "expiresAt" = COALESCE(EXCLUDED."expiresAt", "ProjectSectionAccess"."expiresAt"),
  "updatedAt" = NOW();

-- Clear legacy per-task rows after migration into section scopes
DELETE FROM "ProjectTaskAccess";
