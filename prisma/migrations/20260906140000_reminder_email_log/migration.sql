-- CreateTable
CREATE TABLE IF NOT EXISTS "ReminderEmailLog" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "anchorDate" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "toEmails" TEXT NOT NULL,
    "subject" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "error" TEXT,

    CONSTRAINT "ReminderEmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ReminderEmailLog_entityType_entityId_kind_anchorDate_key"
ON "ReminderEmailLog"("entityType", "entityId", "kind", "anchorDate");

CREATE INDEX IF NOT EXISTS "ReminderEmailLog_entityType_entityId_idx"
ON "ReminderEmailLog"("entityType", "entityId");
