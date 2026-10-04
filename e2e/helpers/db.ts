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

export const Role = {
  USER: "USER",
  AMBASSADOR: "AMBASSADOR",
  MODERATOR: "MODERATOR",
  ADMIN: "ADMIN",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export async function promoteToRole(email: string, role: Role): Promise<void> {
  await pool.query("UPDATE users SET role = $1 WHERE email = $2", [role, email.toLowerCase()]);
}

export async function countAuditLogRows(action: string): Promise<number> {
  const result = await pool.query(
    "SELECT COUNT(*)::int AS count FROM audit_log WHERE action = $1",
    [action],
  );
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
  await pool.query(
    'DELETE FROM consents WHERE "userId" = (SELECT id FROM users WHERE email = $1)',
    [lower],
  );
  await pool.query(
    'DELETE FROM referrals WHERE "referrerId" = (SELECT id FROM users WHERE email = $1) OR "referredUserId" = (SELECT id FROM users WHERE email = $1)',
    [lower],
  );
  await pool.query(
    'DELETE FROM audit_log WHERE "actorId" = (SELECT id FROM users WHERE email = $1)',
    [lower],
  );
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
  // Scoped to A's campus: another campus's rows (e.g. Gachon's) never count as shared.
  const campusOfA = 'SELECT "campusId" FROM users WHERE email = $1';
  const courseRow = await pool.query(
    `SELECT id FROM courses WHERE "campusId" = (${campusOfA}) ORDER BY random() LIMIT 1`,
    [emailA.toLowerCase()],
  );
  const clubRow = await pool.query(
    `SELECT id FROM clubs WHERE "campusId" = (${campusOfA}) ORDER BY random() LIMIT 1`,
    [emailA.toLowerCase()],
  );
  const courseId = courseRow.rows[0]?.id as string | undefined;
  const clubId = clubRow.rows[0]?.id as string | undefined;
  if (!courseId || !clubId) {
    throw new Error(
      "shareCourseAndClub: no course/club reference data on this campus — run db:import-reference first.",
    );
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

/**
 * Directly sets a profile's weekly free-time availability (S17's meetup planner) — no UI
 * path exists to pick specific slots in `completeProfileWizard` (it skips that optional
 * step), so tests that need a real, deterministic mutual overlap set it here instead.
 */
export async function setFreeTimeSlots(email: string, slots: number[]): Promise<void> {
  await pool.query(
    'UPDATE profiles SET "freeTimeSlots" = $1 WHERE "userId" = (SELECT id FROM users WHERE email = $2)',
    [slots, email.toLowerCase()],
  );
}

/** Directly expires a `PlanShareLink` (S17), bypassing real wall-clock waiting — for e2e tests of the "the link expires" behavior itself. */
export async function forceExpireShareLink(token: string): Promise<void> {
  await pool.query(
    "UPDATE plan_share_links SET \"expiresAt\" = now() - interval '1 hour' WHERE token = $1",
    [token],
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
 * A `User` with a minimal `Profile` carrying only `firstName` — unlike `createBareUser`
 * (deliberately profile-less, relied on by chat.spec.ts/waves.spec.ts), this is for a
 * safety test (S16) that needs its seeded user's name to actually render on a pick/wave/
 * match card, so a test can find *its own* card among a long-lived DB's leftovers by
 * `hasText`. Never onboarded (no intents, no `completedAt`) — not eligible as a real
 * matching candidate, only as a `createMatch`/`createIncomingWave`/`seedPickCandidate`
 * target seeded directly.
 */
export async function createUserWithFirstName(email: string, firstName: string): Promise<void> {
  await createBareUser(email, firstName);
  const userRow = await pool.query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
  const userId = userRow.rows[0].id as string;
  await pool.query(
    'INSERT INTO profiles (id, "userId", "firstName", "updatedAt") VALUES ($1, $2, $3, now())',
    [randomUUID(), userId, firstName],
  );
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
  await pool.query('INSERT INTO conversations (id, "matchId") VALUES ($1, $2)', [
    conversationId,
    matchId,
  ]);
  return conversationId;
}

/** Directly marks a conversation EXPIRED, bypassing the 7-day-silence job (unit-tested separately) — for e2e tests of the revive UI/action itself. */
export async function forceExpireConversation(conversationId: string): Promise<void> {
  await pool.query(
    "UPDATE conversations SET status = 'EXPIRED', \"expiredAt\" = now() WHERE id = $1",
    [conversationId],
  );
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
  if (!result.rows[0])
    throw new Error(`getConversationId: no conversation found between ${emailA} and ${emailB}`);
  return result.rows[0].id as string;
}

/** The id of the `Match` row itself between these two users — `createMatch` returns its *Conversation*'s id instead (S17's meetup planner needs the match id, not the conversation id). */
export async function getMatchId(emailA: string, emailB: string): Promise<string> {
  const result = await pool.query(
    `SELECT m.id FROM matches m
     JOIN users a ON a.email = $1 JOIN users b ON b.email = $2
     WHERE (m."userAId" = a.id AND m."userBId" = b.id) OR (m."userAId" = b.id AND m."userBId" = a.id)`,
    [emailA.toLowerCase(), emailB.toLowerCase()],
  );
  if (!result.rows[0])
    throw new Error(`getMatchId: no match found between ${emailA} and ${emailB}`);
  return result.rows[0].id as string;
}

/**
 * Directly seeds `candidateEmail` into `viewerEmail`'s already-composed today's batch
 * (any intent), bypassing the real ranking algorithm — for a safety test (S16) that
 * needs a deterministic, guaranteed-visible pick to then block and re-check, rather than
 * hoping two freshly onboarded users with no real shared signal happen to rank each
 * other into the real top-6. `viewerEmail` must have already visited /picks at least
 * once (via `signInAndOnboard`) so a `DailyBatch` row exists to attach to.
 */
export async function seedPickCandidate(
  viewerEmail: string,
  candidateEmail: string,
): Promise<void> {
  const batchRow = await pool.query(
    `SELECT id FROM daily_batches WHERE "userId" = (SELECT id FROM users WHERE email = $1) ORDER BY "createdAt" DESC LIMIT 1`,
    [viewerEmail.toLowerCase()],
  );
  const dailyBatchId = batchRow.rows[0]?.id as string | undefined;
  if (!dailyBatchId) {
    throw new Error(
      `seedPickCandidate: no daily batch found for ${viewerEmail} — visit /picks first`,
    );
  }
  const rankRow = await pool.query(
    'SELECT COALESCE(MAX(rank), 0) + 1 AS "nextRank" FROM batch_items WHERE "dailyBatchId" = $1',
    [dailyBatchId],
  );
  const nextRank = rankRow.rows[0].nextRank as number;
  await pool.query(
    `INSERT INTO batch_items (id, "dailyBatchId", "candidateUserId", score, reasons, rank)
     VALUES ($1, $2, (SELECT id FROM users WHERE email = $3), 50, '[]'::jsonb, $4)`,
    [randomUUID(), dailyBatchId, candidateEmail.toLowerCase(), nextRank],
  );
}

/** For asserting a moderation action's effect (S16) — the queue itself only shows OPEN reports, so the target's resulting status has to be read directly. */
export async function getUserStatus(email: string): Promise<string> {
  const result = await pool.query("SELECT status FROM users WHERE email = $1", [
    email.toLowerCase(),
  ]);
  if (!result.rows[0]) throw new Error(`getUserStatus: no user found for ${email}`);
  return result.rows[0].status as string;
}

/**
 * How many `Notification` rows of `type` (optionally filtered to `status`) exist for
 * `email` — for S18 e2e tests asserting the real trigger hooks (formMatch, sendWave)
 * actually queue a notification through a real UI-driven action, not just the isolated
 * fake-db unit tests in src/server/notifications/*.test.ts.
 */
export async function countNotifications(
  email: string,
  type: string,
  status?: string,
): Promise<number> {
  const params: string[] = [email.toLowerCase(), type];
  let query = `SELECT COUNT(*)::int AS count FROM notifications n
     JOIN users u ON u.id = n."userId"
     WHERE u.email = $1 AND n.type = $2`;
  if (status) {
    params.push(status);
    query += ` AND n.status = $3`;
  }
  const result = await pool.query(query, params);
  return result.rows[0].count;
}

/** A PENDING wave straight into the `toEmail` user's inbox, bypassing the UI/matching engine entirely — see `createBareUser`. */
export async function createIncomingWave(fromEmail: string, toEmail: string): Promise<void> {
  await pool.query(
    `INSERT INTO waves (id, "fromUserId", "toUserId", "targetElement", status)
     VALUES ($1, (SELECT id FROM users WHERE email = $2), (SELECT id FROM users WHERE email = $3), $4::jsonb, 'PENDING')`,
    [
      randomUUID(),
      fromEmail.toLowerCase(),
      toEmail.toLowerCase(),
      JSON.stringify({ type: "profile" }),
    ],
  );
}

/**
 * S26 cohort release: a throwaway cohort on the test.ac.kr campus with one fresh invite
 * code. Pair with `deleteTestCohort` (after deleting the users in it).
 */
export async function createTestCohort(): Promise<{ cohortId: string; code: string }> {
  const cohortId = randomUUID();
  const code = `E2E${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  await pool.query(
    `INSERT INTO cohorts (id, "campusId", name, "datingOpen")
     SELECT $1, "campusId", $2, false FROM email_domains WHERE domain = 'test.ac.kr'`,
    [cohortId, `e2e-${cohortId}`],
  );
  await pool.query(
    `INSERT INTO invite_codes (id, "cohortId", code, "maxUses", "useCount") VALUES ($1, $2, $3, 1, 0)`,
    [randomUUID(), cohortId, code],
  );
  return { cohortId, code };
}

export async function getInviteUseCount(code: string): Promise<number> {
  const result = await pool.query('SELECT "useCount" FROM invite_codes WHERE code = $1', [code]);
  return result.rows[0]?.useCount ?? -1;
}

export async function deleteTestCohort(cohortId: string): Promise<void> {
  await pool.query('UPDATE users SET "cohortId" = NULL WHERE "cohortId" = $1', [cohortId]);
  await pool.query('DELETE FROM invite_codes WHERE "cohortId" = $1', [cohortId]);
  await pool.query("DELETE FROM cohorts WHERE id = $1", [cohortId]);
}

/**
 * Fast-follow #4 events: put an event in its 48h connect window (it ended an hour ago).
 * Times are computed in SQL like the other helpers here: these are timestamp-without-
 * time-zone columns, and passing a JS Date would store this machine's local time (KST),
 * nine hours off from the UTC the app writes.
 */
export async function endEventAnHourAgo(eventId: string): Promise<void> {
  await pool.query(
    `UPDATE events SET "startsAt" = now() - interval '3 hours', "endsAt" = now() - interval '1 hour' WHERE id = $1`,
    [eventId],
  );
}

/**
 * C8: records that `viewerEmail` passed `candidateEmail` in a batch `daysAgo` days back,
 * for the same intent as the viewer's latest batch. Pair with `seedPickCandidate` to put
 * the candidate back in today's batch as their second chance.
 */
export async function seedEarlierPass(viewerEmail: string, candidateEmail: string, daysAgo = 40): Promise<void> {
  const latest = await pool.query(
    `SELECT "userId", intent FROM daily_batches WHERE "userId" = (SELECT id FROM users WHERE email = $1) ORDER BY "createdAt" DESC LIMIT 1`,
    [viewerEmail.toLowerCase()],
  );
  const row = latest.rows[0] as { userId: string; intent: string } | undefined;
  if (!row) throw new Error(`seedEarlierPass: no daily batch found for ${viewerEmail} — visit /picks first`);
  const batchId = randomUUID();
  await pool.query(
    `INSERT INTO daily_batches (id, "userId", intent, "batchDate") VALUES ($1, $2, $3, (CURRENT_DATE - $4::int))`,
    [batchId, row.userId, row.intent, daysAgo],
  );
  await pool.query(
    `INSERT INTO batch_items (id, "dailyBatchId", "candidateUserId", score, reasons, rank, decision, "decidedAt")
     VALUES ($1, $2, (SELECT id FROM users WHERE email = $3), 50, '[]'::jsonb, 1, 'PASSED', now())`,
    [randomUUID(), batchId, candidateEmail.toLowerCase()],
  );
}

/** Month-2 #7: how many push subscriptions a user has saved. */
export async function countPushSubscriptions(email: string): Promise<number> {
  const result = await pool.query(
    'SELECT COUNT(*)::int AS n FROM push_subscriptions WHERE "userId" = (SELECT id FROM users WHERE email = $1)',
    [email.toLowerCase()],
  );
  return result.rows[0].n as number;
}

/**
 * G10: files `count` OPEN harassment reports against `targetEmail`, each from a new bare
 * reporter user, so the target's trust score drops by one reporter per report. Returns
 * the reporter emails so the test can delete them afterwards.
 */
export async function seedReportsAgainst(targetEmail: string, count: number): Promise<string[]> {
  const reporters: string[] = [];
  for (let i = 0; i < count; i++) {
    const email = `trust-reporter-${Date.now()}-${i}@test.ac.kr`;
    await createBareUser(email, `reporter${i}`);
    await pool.query(
      `INSERT INTO reports (id, "reporterId", "targetId", category, priority)
       VALUES ($1, (SELECT id FROM users WHERE email = $2), (SELECT id FROM users WHERE email = $3), 'HARASSMENT', 'STANDARD')`,
      [randomUUID(), email, targetEmail.toLowerCase()],
    );
    reporters.push(email);
  }
  return reporters;
}
