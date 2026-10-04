import { randomInt } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { Gender, UserStatus } from "@/generated/prisma/enums";
import { canUseDatingMode, type ConsentDb } from "@/server/consent/consent";

/**
 * J2 cohort release (REQUIREMENTS.md §6). Off unless COHORT_RELEASE=on, so local dev,
 * CI and the private demo keep working without invite codes. When on:
 *   - account onboarding requires a valid invite code, which puts the user in a cohort;
 *   - Dating mode is available only in cohorts that passed the density gate
 *     (`Cohort.datingOpen`), on top of the sensitive consent.
 */
export function isCohortReleaseEnabled(): boolean {
  return process.env.COHORT_RELEASE === "on";
}

/** Invite codes are case-insensitive and tolerate spaces or dashes when typed. */
export function normalizeInviteCode(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

// No 0/O/1/I/L: easy to read aloud and copy from a group chat.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateInviteCode(length = 8): string {
  let code = "";
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/**
 * Atomically uses one redemption of `code` and puts the user in its cohort. One SQL
 * update does the check and the increment together, so two people racing for a code's
 * last use can't both get in. The code must belong to a cohort on the user's own campus.
 * Returns false for an unknown, used-up, expired or other-campus code.
 */
export async function redeemInviteCode(
  tx: Prisma.TransactionClient,
  input: { userId: string; campusId: string; code: string; now?: Date },
): Promise<boolean> {
  const code = normalizeInviteCode(input.code);
  const now = input.now ?? new Date();
  const rows = await tx.$queryRaw<{ cohortId: string }[]>`
    UPDATE invite_codes
       SET "useCount" = "useCount" + 1
     WHERE code = ${code}
       AND "useCount" < "maxUses"
       AND ("expiresAt" IS NULL OR "expiresAt" > ${now})
       AND "cohortId" IN (SELECT id FROM cohorts WHERE "campusId" = ${input.campusId})
     RETURNING "cohortId"`;
  if (rows.length === 0) return false;
  await tx.user.update({ where: { id: input.userId }, data: { cohortId: rows[0].cohortId } });
  return true;
}

export type DatingStatus = "available" | "needs_consent" | "cohort_closed";

export type DatingStatusDb = ConsentDb & Pick<PrismaClient, "user">;

/**
 * The one answer to "can this user use Dating mode right now?". Consent is checked
 * first because it's the user's own choice; the cohort gate is the launch's.
 */
export async function getDatingStatus(
  db: DatingStatusDb,
  userId: string,
  options: { cohortRelease?: boolean } = {},
): Promise<DatingStatus> {
  if (!(await canUseDatingMode(db, userId))) return "needs_consent";
  if (!(options.cohortRelease ?? isCohortReleaseEnabled())) return "available";
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { cohort: { select: { datingOpen: true } } },
  });
  return user?.cohort?.datingOpen ? "available" : "cohort_closed";
}

/** REQUIREMENTS.md §6 density gate. Tunable here, in one place. */
export const DENSITY_GATE = { minEligibleUsers: 150, minGenderShare: 0.35 } as const;

export type CohortDensity = {
  eligible: number;
  women: number;
  men: number;
  other: number;
  womenShare: number;
  menShare: number;
  passes: boolean;
};

/**
 * Counts the cohort's eligible pool: active, selfie-verified, passed the 19+ age gate.
 * "No gender group under 35%" is applied to the women and men groups. Applied literally
 * to every group, small groups (non-binary, other) would keep Dating closed forever.
 * This interpretation needs the owner's confirmation.
 */
export async function computeCohortDensity(
  db: Pick<PrismaClient, "user">,
  cohortId: string,
): Promise<CohortDensity> {
  const users = await db.user.findMany({
    where: {
      cohortId,
      status: UserStatus.ACTIVE,
      verifiedAt: { not: null },
      ageVerifiedAt: { not: null },
    },
    select: { profile: { select: { gender: true } } },
  });
  return summarizeDensity(users.map((u) => u.profile?.gender ?? null));
}

export function summarizeDensity(genders: (Gender | null)[]): CohortDensity {
  const eligible = genders.length;
  const women = genders.filter((g) => g === Gender.WOMAN).length;
  const men = genders.filter((g) => g === Gender.MAN).length;
  const womenShare = eligible === 0 ? 0 : women / eligible;
  const menShare = eligible === 0 ? 0 : men / eligible;
  return {
    eligible,
    women,
    men,
    other: eligible - women - men,
    womenShare,
    menShare,
    passes:
      eligible >= DENSITY_GATE.minEligibleUsers &&
      womenShare >= DENSITY_GATE.minGenderShare &&
      menShare >= DENSITY_GATE.minGenderShare,
  };
}
