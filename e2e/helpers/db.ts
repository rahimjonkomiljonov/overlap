import { randomUUID } from "node:crypto";
import { Pool } from "pg";

/**
 * Direct DB access for e2e setup/assertions only (never for the app itself to make
 * decisions with) — plain `pg`, not the generated Prisma client, because Playwright's
 * test-file loader can't evaluate that generated client module (it uses `import.meta`
 * in a way Playwright's transform doesn't support), unlike Vitest's Vite-native one.
 *
 * There's no UI path to grant a role (scripts/promote-role.ts is the real bootstrap
 * mechanism), so tests that need a moderator/admin session use this instead of
 * shelling out to that CLI for every test.
 */
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const Role = { USER: "USER", AMBASSADOR: "AMBASSADOR", MODERATOR: "MODERATOR", ADMIN: "ADMIN" } as const;
export type Role = (typeof Role)[keyof typeof Role];

export async function promoteToRole(email: string, role: Role): Promise<void> {
  await pool.query('UPDATE users SET role = $1 WHERE email = $2', [role, email.toLowerCase()]);
}

export async function countAuditLogRows(action: string): Promise<number> {
  const result = await pool.query('SELECT COUNT(*)::int AS count FROM audit_log WHERE action = $1', [action]);
  return result.rows[0].count;
}

/**
 * Sets `User.verifiedAt` directly (no e2e path drives the real S08 selfie-upload +
 * moderator-approval flow just to get a test user eligible as a matching candidate —
 * that flow is already covered by `e2e/verification.spec.ts`). The matching engine's
 * candidate pool (S10) requires `verifiedAt` on both sides of a pair, same as it will
 * for any real user.
 */
export async function verifyUser(email: string): Promise<void> {
  await pool.query('UPDATE users SET "verifiedAt" = now() WHERE email = $1', [email.toLowerCase()]);
}

/**
 * Deletes a test-created user (and, via cascade, their profile/photos/selfies/waves/
 * daily batches). `User` isn't cascade-deletable on its own — `Consent`, `Referral` and
 * `AuditLog` reference it without `onDelete: Cascade` by design (a consent or audit
 * record must never silently disappear for a *real* user) — so those rows are cleared
 * first. Tests that call `shareCourseAndClub` should call this afterwards: that helper
 * always attaches the *same* reference course/club (there's only a handful in S06's
 * sample dataset), so leftover users from repeated runs would otherwise keep
 * accumulating shared-course "noise" that could outrank the pair a later run creates.
 */
export async function deleteTestUser(email: string): Promise<void> {
  const lower = email.toLowerCase();
  await pool.query('DELETE FROM consents WHERE "userId" = (SELECT id FROM users WHERE email = $1)', [lower]);
  await pool.query(
    'DELETE FROM referrals WHERE "referrerId" = (SELECT id FROM users WHERE email = $1) OR "referredUserId" = (SELECT id FROM users WHERE email = $1)',
    [lower],
  );
  await pool.query('DELETE FROM audit_log WHERE "actorId" = (SELECT id FROM users WHERE email = $1)', [lower]);
  await pool.query("DELETE FROM users WHERE email = $1", [lower]);
}

/**
 * Forces a real course+club overlap between two already-onboarded users, direct via SQL
 * — `completeProfileWizard()` deliberately skips the optional courses/clubs steps, so
 * without this, two independently onboarded e2e users have no shared signal for the
 * matching engine (S10) to find them by. Uses whatever reference data the campus
 * already has (S06's `db:import-reference`), the same course/club for both users.
 */
export async function shareCourseAndClub(emailA: string, emailB: string): Promise<void> {
  const courseRow = await pool.query("SELECT id FROM courses LIMIT 1");
  const clubRow = await pool.query("SELECT id FROM clubs LIMIT 1");
  const courseId = courseRow.rows[0]?.id as string | undefined;
  const clubId = clubRow.rows[0]?.id as string | undefined;
  if (!courseId || !clubId) {
    throw new Error("shareCourseAndClub: no course/club reference data on this campus — run db:import-reference first.");
  }

  for (const email of [emailA, emailB]) {
    const profileRow = await pool.query(
      'SELECT p.id FROM profiles p JOIN users u ON u.id = p."userId" WHERE u.email = $1',
      [email.toLowerCase()],
    );
    const profileId = profileRow.rows[0]?.id as string | undefined;
    if (!profileId) throw new Error(`shareCourseAndClub: no profile found for ${email}`);

    await pool.query(
      'INSERT INTO profile_courses (id, "profileId", "courseId") VALUES ($1, $2, $3) ON CONFLICT ("profileId", "courseId") DO NOTHING',
      [randomUUID(), profileId, courseId],
    );
    await pool.query(
      'INSERT INTO profile_clubs (id, "profileId", "clubId") VALUES ($1, $2, $3) ON CONFLICT ("profileId", "clubId") DO NOTHING',
      [randomUUID(), profileId, clubId],
    );
  }
}
