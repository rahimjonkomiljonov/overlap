-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'AMBASSADOR', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "VerificationDecision" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'USER',
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "selfies" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storageKey" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decision" "VerificationDecision" NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "reason" TEXT,
    "purgedAt" TIMESTAMP(3),

    CONSTRAINT "selfies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "selfies_userId_idx" ON "selfies"("userId");

-- CreateIndex
CREATE INDEX "selfies_decision_submittedAt_idx" ON "selfies"("decision", "submittedAt");

-- AddForeignKey
ALTER TABLE "selfies" ADD CONSTRAINT "selfies_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selfies" ADD CONSTRAINT "selfies_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

