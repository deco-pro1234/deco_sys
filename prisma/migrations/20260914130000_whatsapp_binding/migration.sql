-- CreateTable
CREATE TABLE "WhatsAppBinding" (
    "id" TEXT NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppBinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppBinding_phoneE164_key" ON "WhatsAppBinding"("phoneE164");

-- CreateIndex
CREATE INDEX "WhatsAppBinding_userId_idx" ON "WhatsAppBinding"("userId");

-- AddForeignKey
ALTER TABLE "WhatsAppBinding" ADD CONSTRAINT "WhatsAppBinding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
