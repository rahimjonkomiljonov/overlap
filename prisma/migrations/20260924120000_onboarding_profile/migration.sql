-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('WOMAN', 'MAN', 'NONBINARY', 'OTHER');

-- CreateEnum
CREATE TYPE "IntentMode" AS ENUM ('FRIENDS', 'STUDY', 'DATING', 'OPEN');

-- CreateTable
CREATE TABLE "profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstName" TEXT,
    "gender" "Gender",
    "pronouns" TEXT,
    "year" INTEGER,
    "major" TEXT,
    "intents" "IntentMode"[] DEFAULT ARRAY[]::"IntentMode"[],
    "interestedIn" TEXT,
    "freeTimeSlots" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "valuesAnswers" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "interestsFreeText" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "onboardingStep" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_courses" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "sectionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_clubs" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_clubs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_spots" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "spotId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_spots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_interest_tags" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "interestTagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_interest_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_answers" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prompt_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photos" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_userId_key" ON "profiles"("userId");

-- CreateIndex
CREATE INDEX "profile_courses_courseId_idx" ON "profile_courses"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "profile_courses_profileId_courseId_key" ON "profile_courses"("profileId", "courseId");

-- CreateIndex
CREATE INDEX "profile_clubs_clubId_idx" ON "profile_clubs"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "profile_clubs_profileId_clubId_key" ON "profile_clubs"("profileId", "clubId");

-- CreateIndex
CREATE INDEX "profile_spots_spotId_idx" ON "profile_spots"("spotId");

-- CreateIndex
CREATE UNIQUE INDEX "profile_spots_profileId_spotId_key" ON "profile_spots"("profileId", "spotId");

-- CreateIndex
CREATE INDEX "profile_interest_tags_interestTagId_idx" ON "profile_interest_tags"("interestTagId");

-- CreateIndex
CREATE UNIQUE INDEX "profile_interest_tags_profileId_interestTagId_key" ON "profile_interest_tags"("profileId", "interestTagId");

-- CreateIndex
CREATE INDEX "prompt_answers_promptId_idx" ON "prompt_answers"("promptId");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_answers_profileId_promptId_key" ON "prompt_answers"("profileId", "promptId");

-- CreateIndex
CREATE INDEX "photos_profileId_idx" ON "photos"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "photos_profileId_sortOrder_key" ON "photos"("profileId", "sortOrder");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_courses" ADD CONSTRAINT "profile_courses_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_courses" ADD CONSTRAINT "profile_courses_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_courses" ADD CONSTRAINT "profile_courses_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "course_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_clubs" ADD CONSTRAINT "profile_clubs_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_clubs" ADD CONSTRAINT "profile_clubs_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_spots" ADD CONSTRAINT "profile_spots_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_spots" ADD CONSTRAINT "profile_spots_spotId_fkey" FOREIGN KEY ("spotId") REFERENCES "spots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_interest_tags" ADD CONSTRAINT "profile_interest_tags_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_interest_tags" ADD CONSTRAINT "profile_interest_tags_interestTagId_fkey" FOREIGN KEY ("interestTagId") REFERENCES "interest_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_answers" ADD CONSTRAINT "prompt_answers_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_answers" ADD CONSTRAINT "prompt_answers_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "prompts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

