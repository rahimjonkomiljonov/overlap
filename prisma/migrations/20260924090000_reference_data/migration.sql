-- pg_trgm backs the autocomplete indexes (LIKE %q% on searchText). IF NOT EXISTS: on
-- Supabase it may already be enabled (in the "extensions" schema, which is on the
-- default search_path there), and then this is a no-op.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "SpotKind" AS ENUM ('CAFE', 'LIBRARY', 'DINING', 'LOUNGE', 'OUTDOOR', 'SPORTS', 'OTHER');

-- CreateEnum
CREATE TYPE "InterestCategory" AS ENUM ('ARTS', 'MUSIC', 'SPORTS', 'OUTDOORS', 'FOOD', 'GAMES', 'TECH', 'READING', 'FILM_TV', 'TRAVEL', 'LEARNING', 'SOCIAL', 'LIFESTYLE');

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleEn" TEXT,
    "searchText" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_sections" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "instructor" TEXT,
    "meetingTimes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clubs" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "category" TEXT,
    "description" TEXT,
    "searchText" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clubs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spots" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "kind" "SpotKind" NOT NULL,
    "isSafeSpot" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "searchText" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interest_tags" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" "InterestCategory" NOT NULL,
    "labelKo" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "searchText" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interest_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompts" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "textKo" TEXT NOT NULL,
    "textEn" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prompts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "courses_searchText_idx" ON "courses" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "courses_campusId_term_code_key" ON "courses"("campusId", "term", "code");

-- CreateIndex
CREATE UNIQUE INDEX "course_sections_courseId_section_key" ON "course_sections"("courseId", "section");

-- CreateIndex
CREATE INDEX "clubs_searchText_idx" ON "clubs" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "clubs_campusId_name_key" ON "clubs"("campusId", "name");

-- CreateIndex
CREATE INDEX "spots_searchText_idx" ON "spots" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "spots_campusId_name_key" ON "spots"("campusId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "interest_tags_slug_key" ON "interest_tags"("slug");

-- CreateIndex
CREATE INDEX "interest_tags_searchText_idx" ON "interest_tags" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "prompts_key_key" ON "prompts"("key");

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_sections" ADD CONSTRAINT "course_sections_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spots" ADD CONSTRAINT "spots_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

