-- AlterTable
ALTER TABLE "Memo" ADD COLUMN "privateRecordId" TEXT;
ALTER TABLE "Memo" ADD COLUMN "activityId" TEXT;

-- AddForeignKey
ALTER TABLE "Memo" ADD CONSTRAINT "Memo_privateRecordId_fkey" FOREIGN KEY ("privateRecordId") REFERENCES "PrivateRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Memo" ADD CONSTRAINT "Memo_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Memo_privateRecordId_idx" ON "Memo"("privateRecordId");
CREATE INDEX "Memo_activityId_idx" ON "Memo"("activityId");
