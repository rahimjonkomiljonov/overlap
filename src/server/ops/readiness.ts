import type { PrismaClient } from "@/generated/prisma/client";
import { Role } from "@/generated/prisma/enums";
import { assertNoSyntheticUsersInProduction } from "@/server/synthetic/guard";

export type ReadinessDb = Pick<
  PrismaClient,
  "user" | "interestTag" | "prompt" | "emailDomain" | "course" | "club" | "spot"
>;

export type ReadinessCheck = { name: string; ok: boolean; detail: string };

export const REQUIRED_BUCKETS = ["profile-photos", "verification-selfies"] as const;

/**
 * S24's deploy-time checks against a real database. Each one is something that was
 * found missing by hand on 2026-10-01 (reference data, storage buckets) or is a hard
 * launch rule (no synthetic users, an admin who can moderate). Run it against the
 * production database before opening the app to anyone.
 */
export async function runReadinessChecks(
  db: ReadinessDb,
  options: { campusDomain: string; listBuckets?: () => Promise<string[]> },
): Promise<ReadinessCheck[]> {
  const checks: ReadinessCheck[] = [];

  try {
    await assertNoSyntheticUsersInProduction(db, { isProduction: true });
    checks.push({ name: "No synthetic users", ok: true, detail: "0 synthetic rows" });
  } catch (error) {
    checks.push({ name: "No synthetic users", ok: false, detail: (error as Error).message });
  }

  const [interests, prompts] = await Promise.all([db.interestTag.count(), db.prompt.count()]);
  checks.push({
    name: "Interest taxonomy imported",
    ok: interests > 0,
    detail: `${interests} tags`,
  });
  checks.push({ name: "Prompt library imported", ok: prompts > 0, detail: `${prompts} prompts` });

  const domain = await db.emailDomain.findUnique({
    where: { domain: options.campusDomain },
    select: { campusId: true, campus: { select: { name: true, safetyResources: true } } },
  });
  if (!domain) {
    checks.push({
      name: "Campus exists",
      ok: false,
      detail: `no campus for ${options.campusDomain}`,
    });
  } else {
    const campusId = domain.campusId;
    const [courses, clubs, spots] = await Promise.all([
      db.course.count({ where: { campusId } }),
      db.club.count({ where: { campusId } }),
      db.spot.count({ where: { campusId } }),
    ]);
    checks.push({ name: "Campus exists", ok: true, detail: domain.campus.name });
    checks.push({
      name: "Campus reference data imported",
      ok: courses > 0 && clubs > 0 && spots > 0,
      detail: `${courses} courses, ${clubs} clubs, ${spots} spots`,
    });
    checks.push({
      name: "Campus safety contacts configured",
      ok: domain.campus.safetyResources != null,
      detail: domain.campus.safetyResources != null ? "set (verify numbers by phone)" : "missing",
    });
  }

  const admins = await db.user.count({ where: { role: Role.ADMIN, status: "ACTIVE" } });
  checks.push({ name: "At least one active admin", ok: admins > 0, detail: `${admins} admin(s)` });

  if (options.listBuckets) {
    const buckets = await options.listBuckets();
    const missing = REQUIRED_BUCKETS.filter((b) => !buckets.includes(b));
    checks.push({
      name: "Storage buckets exist",
      ok: missing.length === 0,
      detail: missing.length === 0 ? REQUIRED_BUCKETS.join(", ") : `missing: ${missing.join(", ")}`,
    });
  }

  return checks;
}
