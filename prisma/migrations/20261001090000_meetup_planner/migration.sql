-- CreateEnum
CREATE TYPE "MeetupStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'DECLINED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MeetupFeedbackResponse" AS ENUM ('GREAT', 'FINE', 'NOT_FOR_ME', 'UNCOMFORTABLE');

-- CreateTable
CREATE TABLE "meet_proposals" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "proposedByUserId" TEXT NOT NULL,
    "spotId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "block" INTEGER NOT NULL,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "status" "MeetupStatus" NOT NULL DEFAULT 'PROPOSED',
    "respondedByUserId" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meet_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetup_feedback_entries" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "response" "MeetupFeedbackResponse" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meetup_feedback_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_share_links" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_share_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meet_proposals_matchId_idx" ON "meet_proposals"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "meetup_feedback_entries_proposalId_userId_key" ON "meetup_feedback_entries"("proposalId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "plan_share_links_token_key" ON "plan_share_links"("token");

-- AddForeignKey
ALTER TABLE "meet_proposals" ADD CONSTRAINT "meet_proposals_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meet_proposals" ADD CONSTRAINT "meet_proposals_proposedByUserId_fkey" FOREIGN KEY ("proposedByUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meet_proposals" ADD CONSTRAINT "meet_proposals_spotId_fkey" FOREIGN KEY ("spotId") REFERENCES "spots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetup_feedback_entries" ADD CONSTRAINT "meetup_feedback_entries_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "meet_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetup_feedback_entries" ADD CONSTRAINT "meetup_feedback_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_share_links" ADD CONSTRAINT "plan_share_links_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "meet_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

