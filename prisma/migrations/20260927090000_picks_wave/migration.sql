-- CreateEnum
CREATE TYPE "PickDecision" AS ENUM ('WAVED', 'PASSED');

-- CreateEnum
CREATE TYPE "WaveStatus" AS ENUM ('PENDING', 'MATCHED', 'DECLINED');

-- AlterTable
ALTER TABLE "batch_items" ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "decision" "PickDecision";

-- CreateTable
CREATE TABLE "waves" (
    "id" TEXT NOT NULL,
    "batchItemId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "targetElement" JSONB NOT NULL,
    "note" TEXT,
    "status" "WaveStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "waves_batchItemId_key" ON "waves"("batchItemId");

-- CreateIndex
CREATE INDEX "waves_toUserId_idx" ON "waves"("toUserId");

-- CreateIndex
CREATE UNIQUE INDEX "waves_fromUserId_toUserId_key" ON "waves"("fromUserId", "toUserId");

-- AddForeignKey
ALTER TABLE "waves" ADD CONSTRAINT "waves_batchItemId_fkey" FOREIGN KEY ("batchItemId") REFERENCES "batch_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waves" ADD CONSTRAINT "waves_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waves" ADD CONSTRAINT "waves_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
