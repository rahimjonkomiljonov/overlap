-- CreateEnum
CREATE TYPE "IdfFeatureType" AS ENUM ('COURSE', 'CLUB', 'INTEREST');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "syntheticCommunity" INTEGER;

-- CreateTable
CREATE TABLE "idf_stats" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "featureType" "IdfFeatureType" NOT NULL,
    "featureId" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "idf" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idf_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idf_stats_campusId_featureType_idx" ON "idf_stats"("campusId", "featureType");

-- CreateIndex
CREATE UNIQUE INDEX "idf_stats_campusId_featureType_featureId_key" ON "idf_stats"("campusId", "featureType", "featureId");

-- AddForeignKey
ALTER TABLE "idf_stats" ADD CONSTRAINT "idf_stats_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
