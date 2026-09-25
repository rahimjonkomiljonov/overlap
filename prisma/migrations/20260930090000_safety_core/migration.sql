-- CreateEnum
CREATE TYPE "ReportCategory" AS ENUM ('NON_CONSENSUAL_IMAGERY', 'DEEPFAKE', 'ILLEGAL_FILMING', 'HARASSMENT', 'UNWANTED_CONTACT', 'SCAM_OR_PHISHING', 'SPAM', 'FAKE_PROFILE', 'INAPPROPRIATE_CONTENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportPriority" AS ENUM ('URGENT', 'STANDARD');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ModerationActionType" AS ENUM ('DISMISS', 'WARN', 'SUSPEND', 'BAN', 'POLICE_REFERRAL');

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "incognito" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "suspendedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "conversationId" TEXT,
    "category" "ReportCategory" NOT NULL,
    "priority" "ReportPriority" NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "description" TEXT,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_actions" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" "ModerationActionType" NOT NULL,
    "reason" TEXT NOT NULL,
    "appealNote" TEXT,
    "appealedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reports_status_priority_createdAt_idx" ON "reports"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "reports_targetId_idx" ON "reports"("targetId");

-- CreateIndex
CREATE INDEX "moderation_actions_targetId_idx" ON "moderation_actions"("targetId");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

