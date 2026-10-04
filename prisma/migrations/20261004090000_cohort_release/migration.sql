-- AlterTable
ALTER TABLE "users" ADD COLUMN     "cohortId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "cohorts_campusId_name_key" ON "cohorts"("campusId", "name");

-- CreateIndex
CREATE INDEX "users_cohortId_idx" ON "users"("cohortId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "cohorts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

