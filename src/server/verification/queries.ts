import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { resolvePhotoUrl } from "@/server/storage/photos";
import { resolveSelfieUrl } from "@/server/storage/selfies";

/**
 * Read-side of the verification queue (H2/H4). The `select` below is the actual
 * enforcement of "moderators never see sensitive fields": `Profile.interestedIn`
 * (encrypted "who I'd like to meet", B2) is never named here, so it never leaves the
 * database for this query, however this function's result is used later. See
 * queries.test.ts for a test that fails loudly if a future edit adds it back.
 */

export type VerificationQueueDb = Pick<PrismaClient, "selfie">;

export type VerificationQueueItem = {
  selfieId: string;
  userId: string;
  submittedAt: Date;
  selfieUrl: string;
  userName: string;
  campusName: string | null;
  profile: {
    firstName: string | null;
    gender: string | null;
    year: number | null;
    major: string | null;
    photoUrls: string[];
  } | null;
};

const QUEUE_SELECT = {
  id: true,
  userId: true,
  submittedAt: true,
  storageKey: true,
  user: {
    select: {
      name: true,
      campus: { select: { name: true } },
      profile: {
        select: {
          firstName: true,
          gender: true,
          year: true,
          major: true,
          photos: { select: { storageKey: true }, orderBy: { sortOrder: "asc" as const } },
        },
      },
    },
  },
} as const;

export async function getVerificationQueue(
  db: VerificationQueueDb,
  limit = 20,
): Promise<VerificationQueueItem[]> {
  const rows = await db.selfie.findMany({
    where: { decision: "PENDING", storageKey: { not: null } },
    orderBy: { submittedAt: "asc" },
    take: limit,
    select: QUEUE_SELECT,
  });

  return Promise.all(
    rows.map(async (row) => ({
      selfieId: row.id,
      userId: row.userId,
      submittedAt: row.submittedAt,
      // storageKey is guaranteed non-null by the where clause above.
      selfieUrl: await resolveSelfieUrl(row.storageKey as string),
      userName: row.user.name,
      campusName: row.user.campus?.name ?? null,
      profile: row.user.profile
        ? {
            firstName: row.user.profile.firstName,
            gender: row.user.profile.gender,
            year: row.user.profile.year,
            major: row.user.profile.major,
            photoUrls: await Promise.all(
              row.user.profile.photos.map((p) => resolvePhotoUrl(p.storageKey)),
            ),
          }
        : null,
    })),
  );
}

export type MyVerificationStatus =
  | { state: "verified" }
  | { state: "unsubmitted" }
  | { state: "pending" }
  | { state: "rejected"; reason: string | null };

/** For the user's own /verify page — no admin data, so no sensitivity concern here. */
export async function getMyVerificationStatus(userId: string): Promise<MyVerificationStatus> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { verifiedAt: true } });
  if (user.verifiedAt) return { state: "verified" };

  const latest = await prisma.selfie.findFirst({
    where: { userId },
    orderBy: { submittedAt: "desc" },
    select: { decision: true, reason: true },
  });
  if (!latest) return { state: "unsubmitted" };
  if (latest.decision === "REJECTED") return { state: "rejected", reason: latest.reason };
  return { state: "pending" };
}
