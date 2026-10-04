-- AlterTable
ALTER TABLE "invite_codes" ADD COLUMN     "ownerId" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "inviteCodeId" TEXT;

-- CreateIndex
CREATE INDEX "invite_codes_ownerId_idx" ON "invite_codes"("ownerId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_inviteCodeId_fkey" FOREIGN KEY ("inviteCodeId") REFERENCES "invite_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

