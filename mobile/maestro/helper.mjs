// Test helper for the Maestro flows (BUILD_PLAN M16). It runs on the same computer as the website and the emulator and
// does the things a flow cannot do itself: read the sign-in code from the dev outbox, and set up other people (accounts,
// matches, messages) through the app's own mobile API, so a flow only drives what it is testing.
//
// LOCAL ONLY. It refuses to start unless the website and the database are on localhost and storage is the local folder.
//   export DATABASE_URL=... DIRECT_URL=... (localhost) SUPABASE_SECRET_KEY="" NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
//   node mobile/maestro/helper.mjs        (listens on 127.0.0.1:3999)
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "..", "..");
const BASE = process.env.CHECK_BASE_URL || "http://localhost:3000";
const PORT = Number(process.env.HELPER_PORT || 3999);
const DATABASE_URL = process.env.DATABASE_URL || "";
const OUTBOX = path.join(ROOT, ".dev-outbox.jsonl");
const PHOTO = fs.readFileSync(path.join(ROOT, "e2e/fixtures/photo-with-exif.jpg"));

if (!BASE.startsWith("http://localhost") || !/@(localhost|127\.0\.0\.1)[:/]/.test(DATABASE_URL)) {
  console.error("Refusing to run: needs a localhost website (CHECK_BASE_URL) and a localhost DATABASE_URL.");
  process.exit(2);
}
if (process.env.SUPABASE_SECRET_KEY !== "" || /supabase.co/i.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) {
  console.error('Refusing to run: set SUPABASE_SECRET_KEY="" (empty) and a non-Supabase NEXT_PUBLIC_SUPABASE_URL, here and for the website.');
  process.exit(2);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const AUTH = { "Content-Type": "application/json", "expo-origin": "overlap://" };
/** Every account this helper makes has this prefix, so cleanup can never touch anything else. */
const PREFIX = "mae.";

const readCode = (email, since) => {
  if (!fs.existsSync(OUTBOX)) return null;
  const lines = fs.readFileSync(OUTBOX, "utf8").trim().split("\n").reverse();
  for (const l of lines) {
    if (!l.includes(`"to":"${email}"`)) continue;
    try {
      const row = JSON.parse(l);
      if (since && row.sentAt && new Date(row.sentAt).getTime() < since) return null;
    } catch {
      /* a line that is not JSON is skipped */
    }
    const m = /code is (\d+)/.exec(l);
    if (m) return m[1];
  }
  return null;
};

/** Signs in through the real sign-in API (the same code path as the app) and returns the session cookie. */
async function signIn(email) {
  const started = Date.now() - 1000;
  await fetch(`${BASE}/api/auth/email-otp/send-verification-otp`, { method: "POST", headers: AUTH, body: JSON.stringify({ email, type: "sign-in" }) });
  let code = null;
  for (let i = 0; i < 20 && !code; i++) {
    await sleep(400);
    code = readCode(email, started);
  }
  if (!code) throw new Error(`no sign-in code for ${email}`);
  const res = await fetch(`${BASE}/api/auth/sign-in/email-otp`, { method: "POST", headers: AUTH, body: JSON.stringify({ email, otp: code }) });
  const cookie = (res.headers.get("set-cookie") || "").split(";")[0];
  if (!cookie) throw new Error(`sign-in failed for ${email}: ${res.status}`);
  return cookie;
}

async function call(cookie, method, route, body, extra = {}) {
  const res = await fetch(`${BASE}/api/mobile/v1${route}`, {
    method,
    headers: { "x-app-version": "0.1.0", ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }), ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function uploadPhoto(cookie) {
  const form = new FormData();
  form.set("photo", new File([PHOTO], "upload.jpg", { type: "image/jpeg" }));
  const res = await fetch(`${BASE}/api/mobile/v1/profile/photos`, { method: "POST", headers: { "x-app-version": "0.1.0", cookie }, body: form });
  return res.status;
}

const must = (r, what) => {
  if (r.status < 200 || r.status >= 300) throw new Error(`${what} failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r;
};

const sessions = new Map();
const session = async (email) => {
  if (!sessions.has(email)) sessions.set(email, await signIn(email));
  return sessions.get(email);
};

/** A finished, verified account (account setup, the whole profile, three photos). */
async function makeUser(email, firstName, { sensitive = false } = {}) {
  if (!email.startsWith(PREFIX)) throw new Error(`test accounts must start with ${PREFIX}`);
  const cookie = await session(email);
  must(await call(cookie, "POST", "/onboarding/account", { birthYear: 2000, birthMonth: 5, birthDay: 17, attestedAdult: true, termsAccepted: true, sensitivePreference: sensitive }), "account setup");
  const options = (await call(cookie, "GET", "/profile/options")).body;
  const { prompts, majorGroups } = options;
  must(await call(cookie, "PUT", "/profile/basics", { firstName, gender: "WOMAN", year: 2, major: majorGroups[1].majors[0].ko, interestedIn: sensitive ? ["MAN"] : [] }), "basics");
  must(await call(cookie, "PUT", "/profile/intents", { intents: ["FRIENDS"] }), "intents");
  must(await call(cookie, "PUT", "/profile/prompts", { promptIds: [prompts[0].id, prompts[1].id, prompts[2].id], answers: [`${firstName} one`, `${firstName} two`, `${firstName} three`] }), "prompts");
  must(await call(cookie, "PUT", "/profile/values", { answers: [3, 4, 3, 4, 3, 4, 3, 4] }), "values");
  for (let i = 0; i < 3; i++) if ((await uploadPhoto(cookie)) !== 201) throw new Error("photo upload failed");
  const done = await call(cookie, "POST", "/profile/finish");
  if (done.body.status !== "complete") throw new Error(`finish failed: ${JSON.stringify(done.body)}`);
  await pool.query(`update users set "verifiedAt" = now() where email = $1`, [email]);
  const row = (await pool.query(`select id, "campusId" from users where email = $1`, [email])).rows[0];
  return { email, id: row.id, campusId: row.campusId };
}

/** Gives accounts one course in common, so each is in the others' picks. */
async function shareCourse(a, ...rest) {
  // The course fewest people take, so nobody outside the test lands in these accounts' picks.
  const courseId = (await pool.query(`select c.id from courses c where c."campusId" = $1 order by (select count(*) from profile_courses pc where pc."courseId" = c.id), random() limit 1`, [a.campusId])).rows[0].id;
  for (const u of [a, ...rest]) {
    const profileId = (await pool.query(`select id from profiles where "userId" = $1`, [u.id])).rows[0].id;
    await pool.query(`insert into profile_courses (id, "profileId", "courseId") values ($1, $2, $3) on conflict do nothing`, [randomUUID(), profileId, courseId]);
  }
}

async function waveTo(from, toName, note) {
  const cookie = await session(from);
  const picks = (await call(cookie, "GET", "/picks")).body;
  const card = picks.intents.find((i) => i.intent === "FRIENDS")?.items.find((i) => i.firstName === toName);
  if (!card) throw new Error(`${toName} is not in ${from}'s picks`);
  return must(await call(cookie, "POST", `/picks/${card.id}/wave`, { note }, { "idempotency-key": randomUUID() }), "wave").body;
}

async function waveBack(email, fromId) {
  const cookie = await session(email);
  const inbox = (await call(cookie, "GET", "/waves")).body.waves.find((w) => w.fromUserId === fromId);
  if (!inbox) throw new Error("no wave to answer");
  return must(await call(cookie, "POST", `/waves/${inbox.id}/wave-back`, {}, { "idempotency-key": randomUUID() }), "wave-back").body;
}

const conversationOf = async (aId, bId) =>
  (await pool.query(`select c.id, c."matchId" from conversations c join matches m on m.id = c."matchId" where (m."userAId" = $1 and m."userBId" = $2) or (m."userAId" = $2 and m."userBId" = $1)`, [aId, bId])).rows[0];

const routes = {
  "GET /health": async () => ({ ok: true }),

  /** Real names from the reference data (a major, three prompts, an interest, a course search), so a flow does not guess them. */
  "GET /sample": async () => {
    const email = `${PREFIX}sample.${Date.now()}@test.ac.kr`;
    const user = await makeUser(email, "Sample");
    const cookie = await session(user.email);
    const o = (await call(cookie, "GET", "/profile/options")).body;
    const group = o.majorGroups[1];
    const campusId = user.campusId;
    const course = (await pool.query(`select code, coalesce("titleEn", title) as title from courses where "campusId" = $1 order by code limit 1`, [campusId])).rows[0];
    const club = (await pool.query(`select coalesce("nameEn", name) as name from clubs where "campusId" = $1 order by name limit 1`, [campusId])).rows[0];
    return {
      major: group.majors[0].en,
      prompts: o.prompts.slice(0, 3).map((p) => p.textEn),
      interest: o.interests[0].labelEn,
      course: course ? { code: course.code, title: course.title } : null,
      club: club ? club.name : null,
    };
  },

  /** The latest sign-in code sent to an address, waiting a little for it to arrive. */
  "GET /otp": async (q) => {
    for (let i = 0; i < 25; i++) {
      const code = readCode(q.email, Number(q.since || 0));
      if (code) return { code };
      await sleep(400);
    }
    return { code: null };
  },

  /** One finished, verified account. */
  "POST /user": async (b) => {
    const u = await makeUser(b.email, b.name, { sensitive: Boolean(b.sensitive) });
    return { email: u.email, id: u.id };
  },

  /** Two finished accounts that have matched, with their chat. */
  "POST /pair": async (b) => {
    const a = await makeUser(b.a.email, b.a.name);
    const c = await makeUser(b.b.email, b.b.name);
    await shareCourse(a, c);
    await waveTo(a.email, b.b.name, "hi");
    const out = await waveBack(c.email, a.id);
    if (out.status !== "matched") throw new Error(`no match: ${JSON.stringify(out)}`);
    const conv = await conversationOf(a.id, c.id);
    if (b.freeTime) {
      // Both are free every day from noon to eight (two-hour blocks 6 to 9), so the meetup planner has times to suggest.
      const slots = [];
      for (let day = 0; day < 7; day++) for (let block = 6; block <= 9; block++) slots.push(day * 12 + block);
      await pool.query(`update profiles set "freeTimeSlots" = $2 where "userId" = any($1)`, [[a.id, c.id], slots]);
    }
    return { a: { email: a.email, id: a.id }, b: { email: c.email, id: c.id }, conversationId: conv.id, matchId: conv.matchId };
  },

  /** Two finished accounts that share a course but have not waved, so each is in the other's picks. */
  "POST /neighbours": async (b) => {
    const a = await makeUser(b.a.email, b.a.name);
    const c = await makeUser(b.b.email, b.b.name);
    await shareCourse(a, c);
    return { a: { email: a.email, id: a.id }, b: { email: c.email, id: c.id } };
  },

  /** Several finished accounts that all share one course (each is in the others' picks). */
  "POST /group": async (b) => {
    const users = [];
    for (const p of b.people) users.push(await makeUser(p.email, p.name));
    await shareCourse(...users);
    return { people: users.map((u) => ({ email: u.email, id: u.id })) };
  },

  /** The first names currently in someone's picks, as the app would show them. */
  "GET /picks": async (q) => {
    const cookie = await session(q.email);
    const picks = (await call(cookie, "GET", "/picks")).body;
    const names = (picks.intents ?? []).flatMap((i) => i.items.map((c) => c.firstName));
    return { names, count: names.length };
  },

  /** `from` waves at `toName` (who must be in their picks). */
  "POST /wave": async (b) => waveTo(b.from, b.toName, b.note),

  "POST /message": async (b) => {
    const cookie = await session(b.from);
    return must(await call(cookie, "POST", `/chat/${b.conversationId}/messages`, { text: b.text }, { "idempotency-key": randomUUID() }), "message").body;
  },

  /** Three photos for an account that was set up through the app's own screens. */
  "POST /photos": async (b) => {
    const cookie = await session(b.email);
    for (let i = 0; i < 3; i++) if ((await uploadPhoto(cookie)) !== 201) throw new Error("photo upload failed");
    return { ok: true };
  },

  "POST /verify": async (b) => {
    await pool.query(`update users set "verifiedAt" = now() where email = $1`, [b.email]);
    return { ok: true };
  },

  /** `from` proposes the first suggested time of the meetup planner for a match. */
  "POST /meetup/propose": async (b) => {
    const cookie = await session(b.from);
    const screen = must(await call(cookie, "GET", `/meetup/${b.matchId}`), "meetup screen").body;
    const o = screen.options[0];
    if (!o) throw new Error("the planner has no suggested time");
    return must(await call(cookie, "POST", `/meetup/${b.matchId}/propose`, { spotId: o.spotId, day: o.day, block: o.block }, { "idempotency-key": randomUUID() }), "propose").body;
  },

  /** `from` answers the open proposal of a match: decision is ACCEPT or DECLINE. */
  "POST /meetup/respond": async (b) => {
    const cookie = await session(b.from);
    const p = (await pool.query(`select id from meet_proposals where "matchId" = $1 and status = 'PROPOSED' order by "createdAt" desc limit 1`, [b.matchId])).rows[0];
    if (!p) throw new Error("no open proposal");
    return must(await call(cookie, "POST", `/meetup/proposals/${p.id}/respond`, { decision: b.decision }), "respond").body;
  },

  /** Moves the accepted meetup of a match into the past (UTC, no zone), so the check-in question appears. */
  "POST /meetup/past": async (b) => {
    const r = await pool.query(`update meet_proposals set "scheduledStart" = (now() at time zone 'utc') - interval '5 hours', "scheduledEnd" = (now() at time zone 'utc') - interval '3 hours' where "matchId" = $1 and status = 'ACCEPTED'`, [b.matchId]);
    return { updated: r.rowCount };
  },

  /** What the database says about one account's matching preferences, consent and requests (for a flow's assertions). */
  "GET /privacy/state": async (q) => {
    const u = (await pool.query(`select id, status, "deletedAt" is not null as deleted, "purgedAt" is not null as purged from users where email = $1`, [q.email])).rows[0];
    const p = (await pool.query(`select "weightClasses", "weightInterests", "weightFreeTime", "interestedIn" is not null as has_interested from profiles where "userId" = $1`, [u.id])).rows[0];
    const consent = (await pool.query(`select granted from consents where "userId" = $1 and type = 'SENSITIVE_PREFERENCE' order by "grantedAt" desc limit 1`, [u.id])).rows[0];
    const req = async (type) => (await pool.query(`select count(*)::int as n from data_requests where "userId" = $1 and type = $2`, [u.id, type])).rows[0].n;
    return {
      status: u.status,
      deleted: String(u.deleted),
      purged: String(u.purged),
      weights: `${p.weightClasses},${p.weightInterests},${p.weightFreeTime}`,
      hasInterestedIn: String(p.has_interested),
      sensitiveConsent: String(consent?.granted ?? "none"),
      access: await req("ACCESS"),
      withdrawal: await req("WITHDRAWAL"),
      deletion: await req("DELETION"),
    };
  },

  /** What the database says about safety between two accounts (`email` acting on `other`), for a flow's assertions. */
  "GET /safety/state": async (q) => {
    const id = async (email) => (await pool.query(`select id from users where email = $1`, [email])).rows[0]?.id;
    const u = await id(q.email);
    const o = q.other ? await id(q.other) : null;
    const rep = o ? (await pool.query(`select status, category, description from reports where "reporterId" = $1 and "targetId" = $2`, [u, o])).rows : [];
    const hides = o ? (await pool.query(`select count(*)::int as n from hide_rules where "userId" = $1 and "hiddenUserId" = $2`, [u, o])).rows[0].n : 0;
    const hidesAll = (await pool.query(`select count(*)::int as n from hide_rules where "userId" = $1`, [u])).rows[0].n;
    const blocks = o ? (await pool.query(`select count(*)::int as n from blocks where "blockerId" = $1 and "blockedId" = $2`, [u, o])).rows[0].n : 0;
    const acc = (await pool.query(`select status from users where id = $1`, [u])).rows[0];
    const prof = (await pool.query(`select incognito from profiles where "userId" = $1`, [u])).rows[0];
    const act = (await pool.query(`select "appealNote", "appealedAt" is not null as appealed from moderation_actions where "targetId" = $1 order by "createdAt" desc limit 1`, [u])).rows[0];
    return {
      reports: rep.length,
      reportStatus: rep[0]?.status ?? "none",
      reportCategory: rep[0]?.category ?? "none",
      reportText: rep[0]?.description ?? "none",
      hides,
      hidesAll,
      blocks,
      status: acc?.status ?? "none",
      incognito: String(Boolean(prof?.incognito)),
      appealNote: act?.appealNote ?? "none",
      appealed: String(Boolean(act?.appealed)),
    };
  },

  /** `reporter` reports `target`, then a moderation action (`actor` acting) suspends `target` for seven days. */
  "POST /safety/suspend": async (b) => {
    const cookie = await session(b.reporter);
    const id = async (email) => (await pool.query(`select id from users where email = $1`, [email])).rows[0].id;
    const [t, r, a] = [await id(b.target), await id(b.reporter), await id(b.actor)];
    must(await call(cookie, "POST", "/reports", { targetUserId: t, category: "SPAM" }, { "idempotency-key": randomUUID() }), "report");
    const reportId = (await pool.query(`select id from reports where "reporterId" = $1 and "targetId" = $2`, [r, t])).rows[0].id;
    await pool.query(`insert into moderation_actions (id, "reportId", "targetId", "actorId", type, reason) values ($1, $2, $3, $4, 'SUSPEND'::"ModerationActionType", $5)`, [randomUUID(), reportId, t, a, "repeated spam"]);
    await pool.query(`update users set status = 'SUSPENDED', "suspendedUntil" = ((now() at time zone 'utc') + interval '7 days') where id = $1`, [t]);
    return { ok: true };
  },

  /** `from` turns Campus Pockets visibility on or off for themselves. */
  "POST /pockets/visible": async (b) => {
    const cookie = await session(b.from);
    return must(await call(cookie, "PUT", "/pockets/visibility", { visible: Boolean(b.visible) }), "pockets visibility").body;
  },

  /** Whether an account is visible in Campus Pockets (for a flow's assertions). */
  "GET /pockets/state": async (q) => {
    const r = (await pool.query(`select p."pocketsVisible" as visible from profiles p join users u on u.id = p."userId" where u.email = $1`, [q.email])).rows[0];
    return { visible: String(Boolean(r?.visible)) };
  },

  /** An event on the organizer's campus at its first Safe Spot. START and END are offsets from now such as "1 day" or "-6 hours". */
  "POST /event": async (b) => {
    const offset = /^-?\d+ (hour|hours|day|days)$/;
    if (!offset.test(b.start) || !offset.test(b.end)) throw new Error("start and end must look like '1 day' or '-6 hours'");
    const org = (await pool.query(`select id, "campusId" from users where email = $1 and email like '${PREFIX}%'`, [b.organizer])).rows[0];
    if (!org) throw new Error("unknown organizer");
    const spot = (await pool.query(`select id from spots where "campusId" = $1 and "isSafeSpot" = true and active = true limit 1`, [org.campusId])).rows[0];
    const id = randomUUID();
    await pool.query(
      `insert into events (id, "campusId", "organizerId", "spotId", title, description, "startsAt", "endsAt", capacity) values ($1, $2, $3, $4, $5, $6, (now() at time zone 'utc') + interval '${b.start}', (now() at time zone 'utc') + interval '${b.end}', $7)`,
      [id, org.campusId, org.id, spot.id, b.title, `Join us for ${b.title}. Bring a friend!`, b.capacity ?? null],
    );
    return { id };
  },

  /** `from` answers an event: going (and whether to be listed among the guests). */
  "POST /event/rsvp": async (b) => {
    const cookie = await session(b.from);
    return must(await call(cookie, "PUT", `/events/${b.eventId}/rsvp`, { going: b.going, showInGuestList: Boolean(b.showInGuestList) }), "rsvp").body;
  },

  /** `from` picks `toEmail` in an event's 48-hour window ("We met"). */
  "POST /event/connect": async (b) => {
    const cookie = await session(b.from);
    const to = (await pool.query(`select id from users where email = $1`, [b.toEmail])).rows[0];
    return must(await call(cookie, "POST", `/events/${b.eventId}/connect`, { toUserId: to.id }, { "idempotency-key": randomUUID() }), "connect").body;
  },

  /** Moves an event to six to four hours ago, which puts it inside the 48-hour connect window. */
  "POST /event/ended": async (b) => {
    await pool.query(`update events set "startsAt" = (now() at time zone 'utc') - interval '6 hours', "endsAt" = (now() at time zone 'utc') - interval '4 hours' where id = $1`, [b.eventId]);
    return { ok: true };
  },

  /** What the database says about one person and an event, for a flow's assertions. */
  "GET /event/state": async (q) => {
    const u = (await pool.query(`select id from users where email = $1`, [q.email])).rows[0];
    const rsvp = (await pool.query(`select "showInGuestList" from event_rsvps where "eventId" = $1 and "userId" = $2`, [q.eventId, u.id])).rows[0];
    const picks = (await pool.query(`select count(*)::int as n from event_connects where "eventId" = $1 and "fromUserId" = $2`, [q.eventId, u.id])).rows[0].n;
    const matches = (await pool.query(`select count(*)::int as n from matches where "userAId" = $1 or "userBId" = $1`, [u.id])).rows[0].n;
    return { rsvp: rsvp ? "yes" : "none", listed: rsvp ? String(rsvp.showInGuestList) : "none", picks, matches };
  },

  /** What the database says about a match's meetup, for a flow's assertions. */
  "GET /meetup/state": async (q) => {
    const rows = (await pool.query(`select id, status from meet_proposals where "matchId" = $1 order by "createdAt"`, [q.matchId])).rows;
    const open = rows.find((r) => r.status === "PROPOSED" || r.status === "ACCEPTED");
    const links = open ? (await pool.query(`select count(*)::int as n from plan_share_links where "proposalId" = $1`, [open.id])).rows[0].n : 0;
    const feedback = (await pool.query(`select response from meetup_feedback_entries where "proposalId" in (select id from meet_proposals where "matchId" = $1)`, [q.matchId])).rows;
    return { statuses: rows.map((r) => r.status).join(","), last: rows.at(-1)?.status ?? "", links, feedback: feedback.map((f) => f.response).join(",") };
  },

  /** What the database says about an account, for a flow's assertions. */
  "GET /state": async (q) => {
    const u = (await pool.query(`select id, status, "verifiedAt" is not null as verified, "birthYear" from users where email = $1`, [q.email])).rows[0];
    if (!u) return { exists: false };
    const profile = (await pool.query(`select "firstName", cardinality("valuesAnswers") > 0 as values_done from profiles where "userId" = $1`, [u.id])).rows[0];
    const photos = (await pool.query(`select count(*)::int as n from photos where "profileId" in (select id from profiles where "userId" = $1)`, [u.id])).rows[0].n;
    const waves = (await pool.query(`select count(*)::int as n from waves where "fromUserId" = $1`, [u.id])).rows[0].n;
    const matches = (await pool.query(`select count(*)::int as n from matches where "userAId" = $1 or "userBId" = $1`, [u.id])).rows[0].n;
    const messages = (await pool.query(`select count(*)::int as n from messages where "senderId" = $1`, [u.id])).rows[0].n;
    return { exists: true, ...u, firstName: profile?.firstName ?? null, photos, waves, matches, messages };
  },

  /** Deletes every account this helper made (only addresses starting with `mae.`). */
  "POST /cleanup": async () => {
    const who = `(select id from users where email like '${PREFIX}%')`;
    await pool.query(`delete from moderation_actions where "actorId" in ${who} or "targetId" in ${who}`);
    await pool.query(`delete from events where "organizerId" in ${who}`);
    await pool.query(`delete from messages where "senderId" in ${who}`);
    await pool.query(`delete from consents where "userId" in ${who}`);
    await pool.query(`delete from referrals where "referrerId" in ${who} or "referredUserId" in ${who}`);
    await pool.query(`delete from audit_log where "actorId" in ${who}`);
    const r = await pool.query(`delete from users where email like '${PREFIX}%'`);
    sessions.clear();
    return { deleted: r.rowCount };
  },
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const handler = routes[`${req.method} ${url.pathname}`];
  const send = (status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (!handler) return send(404, { error: "NOT_FOUND" });
  let body = {};
  if (req.method === "POST") {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    try {
      body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
    } catch {
      return send(400, { error: "BAD_JSON" });
    }
  }
  try {
    send(200, await handler(req.method === "GET" ? Object.fromEntries(url.searchParams) : body));
  } catch (e) {
    console.error(`${req.method} ${url.pathname}:`, e.message);
    send(500, { error: e.message });
  }
});

server.listen(PORT, "127.0.0.1", () => console.log(`Maestro helper on http://127.0.0.1:${PORT} (website ${BASE})`));
