-- CreateEnum
CREATE TYPE "TrustAppealStatus" AS ENUM ('OPEN', 'ACCEPTED', 'REJECTED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "reachRestoredUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "trust_appeals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "status" "TrustAppealStatus" NOT NULL DEFAULT 'OPEN',
    "reviewerId" TEXT,
    "response" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "trust_appeals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trust_appeals_status_createdAt_idx" ON "trust_appeals"("status", "createdAt");

-- CreateIndex
CREATE INDEX "trust_appeals_userId_idx" ON "trust_appeals"("userId");

-- AddForeignKey
ALTER TABLE "trust_appeals" ADD CONSTRAINT "trust_appeals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_appeals" ADD CONSTRAINT "trust_appeals_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

