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
 * already has (S06's `db:import-reference`), a *random* course/club (not always the
 * same row) for both users — S15's full-suite run found that always picking the same
 * one crowds a test's own pair out of the ranked top-6 when several spec files call
 * this helper around the same moment (a11y.spec.ts, picks.spec.ts, waves.spec.ts and
 * chat.spec.ts all do): every concurrent pair landed on the identical course+club,
 * so the pool briefly had far more "equally good" candidates than any one test expects.
 * Randomizing spreads concurrent pairs across whatever reference rows exist instead of
 * piling them all onto one.
 */
export async function shareCourseAndClub(emailA: string, emailB: string): Promise<void> {
  const courseRow = await pool.query("SELECT id FROM courses ORDER BY random() LIMIT 1");
  const clubRow = await pool.query("SELECT id FROM clubs ORDER BY random() LIMIT 1");
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

/** Blocks `blockedEmail` from `blockerEmail`'s side, direct via SQL (no UI path exists yet — S16 builds one). */
export async function blockUser(blockerEmail: string, blockedEmail: string): Promise<void> {
  await pool.query(
    `INSERT INTO blocks (id, "blockerId", "blockedId")
     VALUES ($1, (SELECT id FROM users WHERE email = $2), (SELECT id FROM users WHERE email = $3))`,
    [randomUUID(), blockerEmail.toLowerCase(), blockedEmail.toLowerCase()],
  );
}

/** How many `Match` rows exist between these two users, in either userA/userB order — should only ever be 0 or 1 (`@@unique([userAId, userBId])`, always inserted in a normalized order). */
export async function countMatches(emailA: string, emailB: string): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM matches m
     JOIN users a ON a.email = $1 JOIN users b ON b.email = $2
     WHERE (m."userAId" = a.id AND m."userBId" = b.id) OR (m."userAId" = b.id AND m."userBId" = a.id)`,
    [emailA.toLowerCase(), emailB.toLowerCase()],
  );
  return result.rows[0].count;
}

/**
 * A minimal `User` row with no profile — for seeding a `Wave` sender in a test that only
 * cares about the *recipient*'s side (e.g. the daily-cap test needs 9 distinct senders,
 * not 9 fully onboarded browser sessions). `getIncomingWaves` (src/server/waves/queries.ts)
 * already handles a sender with no profile gracefully (null name/photo).
 */
export async function createBareUser(email: string, name: string): Promise<void> {
  await pool.query('INSERT INTO users (id, name, email, "updatedAt") VALUES ($1, $2, $3, now())', [
    randomUUID(),
    name,
    email.toLowerCase(),
  ]);
}

/**
 * An ACTIVE match (plus its Conversation, matching formMatch's real invariant that every
 * Match always has exactly one) between two already-onboarded users, direct via SQL —
 * for tests (a11y's populated /matches check, S15's chat tests) that need a real match
 * to render without re-driving the full mutual-wave flow already covered by
 * e2e/waves.spec.ts. Which side is userA/userB doesn't matter here (unlike the app's own
 * `orderedPair`) — `getMatches` queries both sides, and the `@@unique` constraint
 * doesn't care which is which. Returns the new conversation's id.
 */
export async function createMatch(emailA: string, emailB: string): Promise<string> {
  const matchId = randomUUID();
  await pool.query(
    `INSERT INTO matches (id, "userAId", "userBId")
     VALUES ($1, (SELECT id FROM users WHERE email = $2), (SELECT id FROM users WHERE email = $3))`,
    [matchId, emailA.toLowerCase(), emailB.toLowerCase()],
  );
  const conversationId = randomUUID();
  await pool.query('INSERT INTO conversations (id, "matchId") VALUES ($1, $2)', [conversationId, matchId]);
  return conversationId;
}

/** Directly marks a conversation EXPIRED, bypassing the 7-day-silence job (unit-tested separately) — for e2e tests of the revive UI/action itself. */
export async function forceExpireConversation(conversationId: string): Promise<void> {
  await pool.query('UPDATE conversations SET status = \'EXPIRED\', "expiredAt" = now() WHERE id = $1', [conversationId]);
}

/** The id of the Conversation for the (already-formed) match between these two users. */
export async function getConversationId(emailA: string, emailB: string): Promise<string> {
  const result = await pool.query(
    `SELECT c.id FROM conversations c
     JOIN matches m ON m.id = c."matchId"
     JOIN users a ON a.email = $1 JOIN users b ON b.email = $2
     WHERE (m."userAId" = a.id AND m."userBId" = b.id) OR (m."userAId" = b.id AND m."userBId" = a.id)`,
    [emailA.toLowerCase(), emailB.toLowerCase()],
  );
  if (!result.rows[0]) throw new Error(`getConversationId: no conversation found between ${emailA} and ${emailB}`);
  return result.rows[0].id as string;
}

/** A PENDING wave straight into the `toEmail` user's inbox, bypassing the UI/matching engine entirely — see `createBareUser`. */
export async function createIncomingWave(fromEmail: string, toEmail: string): Promise<void> {
  await pool.query(
    `INSERT INTO waves (id, "fromUserId", "toUserId", "targetElement", status)
     VALUES ($1, (SELECT id FROM users WHERE email = $2), (SELECT id FROM users WHERE email = $3), $4::jsonb, 'PENDING')`,
    [randomUUID(), fromEmail.toLowerCase(), toEmail.toLowerCase(), JSON.stringify({ type: "profile" })],
  );
}
