// Mobile events checks (BUILD_PLAN M11) against a running LOCAL stack: the website on localhost with a
// throwaway database that has the reference data imported (shared lists plus the sample campus) and the
// local-development storage folder. Mirrors scripts/check-mobile-meetup.mjs's setup.
//   export DATABASE_URL=... DIRECT_URL=... (both localhost) && npm run dev, then:
//   node scripts/check-mobile-events.mjs
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "..");
const BASE = process.env.CHECK_BASE_URL || "http://localhost:3000";
const DATABASE_URL = process.env.DATABASE_URL || "";
const OUTBOX = path.join(ROOT, ".dev-outbox.jsonl");
if (!BASE.startsWith("http://localhost") || !/@(localhost|127\.0\.0\.1)[:/]/.test(DATABASE_URL)) {
  console.error(
    "Refusing to run: this script needs a localhost website (CHECK_BASE_URL) and a localhost DATABASE_URL.",
  );
  process.exit(2);
}
if (
  process.env.SUPABASE_SECRET_KEY !== "" ||
  /supabase.co/i.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")
) {
  console.error(
    'Refusing to run: set SUPABASE_SECRET_KEY="" (empty, not unset) and a non-Supabase NEXT_PUBLIC_SUPABASE_URL in the shell that starts the website AND this script.',
  );
  process.exit(2);
}
const pool = new Pool({ connectionString: DATABASE_URL });
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const AUTH = { "Content-Type": "application/json", "expo-origin": "overlap://" };

async function signUp(email) {
  await fetch(`${BASE}/api/auth/email-otp/send-verification-otp`, {
    method: "POST",
    headers: AUTH,
    body: JSON.stringify({ email, type: "sign-in" }),
  });
  await sleep(800);
  const line = fs
    .readFileSync(OUTBOX, "utf8")
    .trim()
    .split("\n")
    .reverse()
    .find((l) => l.includes(`"to":"${email}"`));
  const code = /code is (\d+)/.exec(line)[1];
  const res = await fetch(`${BASE}/api/auth/sign-in/email-otp`, {
    method: "POST",
    headers: AUTH,
    body: JSON.stringify({ email, otp: code }),
  });
  return (res.headers.get("set-cookie") || "").split(";")[0];
}
const call = async (cookie, method, route, body, extraHeaders = {}) => {
  const res = await fetch(`${BASE}/api/mobile/v1${route}`, {
    method,
    headers: {
      "x-app-version": "0.1.0",
      ...(cookie ? { cookie } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})), headers: res.headers };
};
const upload = async (cookie, bytes) => {
  const form = new FormData();
  form.set("photo", new File([bytes], "upload.jpg", { type: "image/jpeg" }));
  const res = await fetch(`${BASE}/api/mobile/v1/profile/photos`, {
    method: "POST",
    headers: { "x-app-version": "0.1.0", cookie },
    body: form,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const setup = (cookie) =>
  call(cookie, "POST", "/onboarding/account", {
    birthYear: 2000,
    birthMonth: 5,
    birthDay: 17,
    attestedAdult: true,
    termsAccepted: true,
    sensitivePreference: false,
  });

async function finishProfile(cookie, firstName, options, photo) {
  const { prompts, majorGroups } = options;
  const steps = [
    ["PUT", "/profile/basics", { firstName, gender: "WOMAN", year: 2, major: majorGroups[1].majors[0].ko, interestedIn: [] }],
    ["PUT", "/profile/intents", { intents: ["FRIENDS"] }],
    [
      "PUT",
      "/profile/prompts",
      { promptIds: [prompts[0].id, prompts[1].id, prompts[2].id], answers: [`${firstName} one`, `${firstName} two`, `${firstName} three`] },
    ],
    ["PUT", "/profile/values", { answers: [3, 4, 3, 4, 3, 4, 3, 4] }],
  ];
  for (const [method, route, body] of steps) {
    const r = await call(cookie, method, route, body);
    if (r.status !== 200) throw new Error(`${route} failed for ${firstName}: ${r.status} ${JSON.stringify(r.body)}`);
  }
  for (let i = 0; i < 3; i++) {
    const r = await upload(cookie, photo);
    if (r.status !== 201) throw new Error(`photo ${i} failed for ${firstName}: ${r.status}`);
  }
  const done = await call(cookie, "POST", "/profile/finish");
  if (done.body.status !== "complete") throw new Error(`finish failed for ${firstName}: ${JSON.stringify(done.body)}`);
}

const stamp = Date.now();
const mail = (tag) => `m11.${tag}.${stamp}@test.ac.kr`;
async function cleanup() {
  for (const tag of ["a", "b", "c", "d"]) {
    const email = mail(tag);
    const who = "(select id from users where email = $1)";
    await pool.query(`delete from messages where "senderId" = ${who}`, [email]);
    await pool.query(`delete from consents where "userId" = ${who}`, [email]);
    await pool.query(`delete from referrals where "referrerId" = ${who} or "referredUserId" = ${who}`, [email]);
    await pool.query(`delete from audit_log where "actorId" = ${who}`, [email]);
    await pool.query(`delete from users where email = $1`, [email]);
  }
}


(async () => {
  const names = { a: "Ava", b: "Ben", c: "Cho", d: "Dev" };
  const photo = fs.readFileSync(path.join(ROOT, "e2e/fixtures/photo-with-exif.jpg"));
  const tags = ["a", "b", "c", "d"];

  const cookies = {};
  for (const tag of tags) {
    cookies[tag] = await signUp(mail(tag));
    const r = await setup(cookies[tag]);
    if (r.status !== 200) throw new Error(`setup failed for ${tag}: ${r.status}`);
  }
  const options = (await call(cookies.a, "GET", "/profile/options")).body;
  for (const tag of tags) await finishProfile(cookies[tag], names[tag], options, photo);

  const ids = {};
  for (const tag of tags) ids[tag] = (await pool.query(`select id from users where email = $1`, [mail(tag)])).rows[0].id;
  // D stays unverified on purpose.
  await pool.query(`update users set "verifiedAt" = now() where id = any($1)`, [[ids.a, ids.b, ids.c]]);
  const campusId = (await pool.query(`select "campusId" from users where id = $1`, [ids.a])).rows[0].campusId;
  const courseId = (await pool.query(`select id from courses where "campusId" = $1 limit 1`, [campusId])).rows[0].id;
  const clubId = (await pool.query(`select id from clubs where "campusId" = $1 limit 1`, [campusId])).rows[0].id;
  const spotId = (await pool.query(`select id from spots where "campusId" = $1 and "isSafeSpot" = true and active = true limit 1`, [campusId])).rows[0].id;
  const profileOf = async (tag) => (await pool.query(`select id from profiles where "userId" = $1`, [ids[tag]])).rows[0].id;
  // A, B and C share a course; A and C also share a club, so C ranks above B for A.
  for (const tag of ["a", "b", "c"]) {
    await pool.query(`insert into profile_courses (id, "profileId", "courseId") values ($1, $2, $3) on conflict do nothing`, [randomUUID(), await profileOf(tag), courseId]);
  }
  for (const tag of ["a", "c"]) {
    await pool.query(`insert into profile_clubs (id, "profileId", "clubId") values ($1, $2, $3) on conflict do nothing`, [randomUUID(), await profileOf(tag), clubId]);
  }
  const rows = async (sql, params) => (await pool.query(sql, params)).rows;

  const mkEvent = async (title, startSql, endSql, extra = {}) => {
    const id = randomUUID();
    await pool.query(
      `insert into events (id, "campusId", "organizerId", "spotId", title, description, "startsAt", "endsAt", capacity, "cancelledAt")
       values ($1, $2, $3, $4, $5, $6, ${startSql}, ${endSql}, $7, ${extra.cancelled ? "(now() at time zone 'utc')" : "null"})`,
      [id, campusId, ids.a, spotId, `${title} ${stamp}`, `${title} description`, extra.capacity ?? null],
    );
    return id;
  };
  const utc = (interval) => `((now() at time zone 'utc') + interval '${interval}')`;
  const E1 = await mkEvent("Small picnic", utc("1 day"), utc("1 day 2 hours"), { capacity: 2 });
  const E2 = await mkEvent("Study night", utc("1 hour"), utc("3 hours"));
  const E3 = await mkEvent("Old meetup", utc("-3 days"), utc("-3 days 2 hours"));
  const E4 = await mkEvent("Cancelled one", utc("2 days"), utc("2 days 2 hours"), { cancelled: true });
  const E5 = await mkEvent("Long ago", utc("-60 hours"), utc("-58 hours"));

  // ---- who may ask
  let r = await call(undefined, "GET", "/events");
  check("no session is refused (401)", r.status === 401);

  // ---- the list
  r = await call(cookies.a, "GET", "/events");
  const list = r.body.events ?? [];
  const byId = Object.fromEntries(list.map((e) => [e.id, e]));
  check("the list opens (200)", r.status === 200);
  check("it has the upcoming events, with going count and capacity", byId[E1]?.phase === "upcoming" && byId[E1].goingCount === 0 && byId[E1].capacity === 2 && byId[E1].imGoing === false && byId[E2]?.phase === "upcoming");
  check("a cancelled event and one past its 48-hour window are not listed", !byId[E4] && !byId[E5]);
  check("an event that ended 3 days ago is not listed either", !byId[E3]);
  check("the list is soonest first", list.map((e) => e.startsAt).join() === [...list.map((e) => e.startsAt)].sort().join());

  // ---- the detail before anyone is going
  r = await call(cookies.a, "GET", `/events/${E1}`);
  check("an event opens (200) with canRsvp true and nothing to connect to yet", r.status === 200 && r.body.canRsvp === true && r.body.canConnect === false && r.body.myRsvp === null && r.body.guests.length === 0);
  r = await call(cookies.a, "GET", `/events/${randomUUID()}`);
  check("an event that does not exist is 404", r.status === 404);

  // ---- RSVP
  r = await call(cookies.a, "PUT", `/events/${E1}/rsvp`, {});
  check("an RSVP without going is refused (400)", r.status === 400);
  r = await call(cookies.a, "PUT", `/events/${E1}/rsvp`, { going: true, extra: 1 });
  check("an unexpected body field is refused (400)", r.status === 400);
  r = await call(cookies.a, "PUT", `/events/${E1}/rsvp`, { going: true });
  check("going works, and being listed is off unless asked for", r.status === 200 && r.body.going === true && r.body.showInGuestList === false);
  check("the database holds the RSVP with showInGuestList false", (await rows(`select "showInGuestList" from event_rsvps where "eventId" = $1 and "userId" = $2`, [E1, ids.a]))[0]?.showInGuestList === false);
  r = await call(cookies.a, "PUT", `/events/${E1}/rsvp`, { going: true });
  check("saying the same thing again changes nothing (still one row)", r.status === 200 && (await rows(`select 1 from event_rsvps where "eventId" = $1 and "userId" = $2`, [E1, ids.a])).length === 1);
  r = await call(cookies.b, "PUT", `/events/${E1}/rsvp`, { going: true, showInGuestList: true });
  check("B goes and asks to be listed", r.status === 200 && r.body.showInGuestList === true);
  r = await call(cookies.c, "PUT", `/events/${E1}/rsvp`, { going: true });
  check("a full event (capacity 2) is 422 FULL for a third person", r.status === 422 && r.body.reason === "FULL");
  r = await call(cookies.b, "PUT", `/events/${E1}/rsvp`, { going: true, showInGuestList: false });
  check("someone already going can still change their listing when it is full", r.status === 200);
  r = await call(cookies.a, "PUT", `/events/${E1}/rsvp`, { going: false });
  check("not going removes the RSVP", r.status === 200 && (await rows(`select 1 from event_rsvps where "eventId" = $1 and "userId" = $2`, [E1, ids.a])).length === 0);
  r = await call(cookies.c, "PUT", `/events/${E1}/rsvp`, { going: true });
  check("which frees a place for the third person", r.status === 200);
  r = await call(cookies.a, "GET", "/events");
  check("the list's going count and my flag follow", (await call(cookies.a, "GET", "/events")).body.events.find((e) => e.id === E1)?.goingCount === 2 && r.body.events.find((e) => e.id === E1)?.imGoing === false);
  r = await call(cookies.a, "PUT", `/events/${E4}/rsvp`, { going: true });
  check("RSVPing to a cancelled event is 422 RSVP_CLOSED", r.status === 422 && r.body.reason === "RSVP_CLOSED");
  r = await call(cookies.a, "PUT", `/events/${E5}/rsvp`, { going: true });
  check("RSVPing after an event has ended is 422 RSVP_CLOSED", r.status === 422 && r.body.reason === "RSVP_CLOSED");
  r = await call(cookies.a, "PUT", `/events/${randomUUID()}/rsvp`, { going: true });
  check("RSVPing to an event that does not exist is 404", r.status === 404);

  // ---- the guest list (event 2)
  await call(cookies.a, "PUT", `/events/${E2}/rsvp`, { going: true, showInGuestList: true });
  await call(cookies.b, "PUT", `/events/${E2}/rsvp`, { going: true, showInGuestList: false });
  await call(cookies.c, "PUT", `/events/${E2}/rsvp`, { going: true, showInGuestList: true });
  await call(cookies.d, "PUT", `/events/${E2}/rsvp`, { going: true, showInGuestList: true });
  r = await call(cookies.a, "GET", `/events/${E2}`);
  let guestIds = r.body.guests.map((g) => g.userId);
  check("A sees only people who opted in: C yes, B (not listed) no, D (unverified) no, and not themselves", guestIds.length === 1 && guestIds[0] === ids.c);
  check("a guest carries only name, photo and what is shared, never an email", Object.keys(r.body.guests[0]).sort().join() === "connected,firstName,matched,overlap,photoUrl,userId" && !JSON.stringify(r.body).includes("@test.ac.kr"));
  check("the overlap counts what A and C share (a course and a club)", r.body.guests[0].overlap === 2);
  await call(cookies.b, "PUT", `/events/${E2}/rsvp`, { going: true, showInGuestList: true });
  r = await call(cookies.a, "GET", `/events/${E2}`);
  check("once B opts in, B appears after C (less in common)", r.body.guests.map((g) => g.userId).join() === [ids.c, ids.b].join() && r.body.guests[1].overlap === 1);
  r = await call(cookies.d, "GET", `/events/${E2}`);
  check("an unverified viewer gets no guest list", r.status === 200 && r.body.viewerVerified === false && r.body.guests.length === 0);
  await pool.query(`insert into blocks (id, "blockerId", "blockedId") values ($1, $2, $3)`, [randomUUID(), ids.c, ids.a]);
  r = await call(cookies.a, "GET", `/events/${E2}`);
  check("a blocked person disappears from the list both ways", !r.body.guests.some((g) => g.userId === ids.c) && !(await call(cookies.c, "GET", `/events/${E2}`)).body.guests.some((g) => g.userId === ids.a));

  // ---- the connect window: moves event 2 to just ended
  r = await call(cookies.a, "POST", `/events/${E2}/connect`, { toUserId: ids.b }, { "idempotency-key": randomUUID() });
  check("connecting before the event is over is 422 CONNECT_CLOSED", r.status === 422 && r.body.reason === "CONNECT_CLOSED");
  await pool.query(`update events set "startsAt" = ${utc("-6 hours")}, "endsAt" = ${utc("-4 hours")} where id = $1`, [E2]);
  r = await call(cookies.a, "GET", `/events/${E2}`);
  check("the event is now in its connect window: phase connect, canConnect true, canRsvp false", r.body.phase === "connect" && r.body.canConnect === true && r.body.canRsvp === false);
  check("the list still shows it", (await call(cookies.a, "GET", "/events")).body.events.some((e) => e.id === E2 && e.phase === "connect"));
  r = await call(cookies.a, "PUT", `/events/${E2}/rsvp`, { going: false });
  check("the RSVP can no longer change (422 RSVP_CLOSED)", r.status === 422 && r.body.reason === "RSVP_CLOSED");
  r = await call(cookies.d, "GET", `/events/${E2}`);
  check("an unverified guest cannot connect (canConnect false)", r.body.canConnect === false);
  r = await call(cookies.d, "POST", `/events/${E2}/connect`, { toUserId: ids.b }, { "idempotency-key": randomUUID() });
  check("and the server refuses it too (422 NOT_VERIFIED)", r.status === 422 && r.body.reason === "NOT_VERIFIED");
  r = await call(cookies.a, "POST", `/events/${E2}/connect`, { toUserId: ids.b });
  check("connecting without an Idempotency-Key is refused (400)", r.status === 400 && r.body.fields?.[0]?.name === "Idempotency-Key");
  r = await call(cookies.a, "POST", `/events/${E2}/connect`, { toUserId: ids.a }, { "idempotency-key": randomUUID() });
  check("picking yourself is refused (400)", r.status === 400);
  r = await call(cookies.a, "POST", `/events/${E2}/connect`, { toUserId: ids.d }, { "idempotency-key": randomUUID() });
  check("an unverified person cannot be picked (404, never says why)", r.status === 404);
  r = await call(cookies.a, "POST", `/events/${E2}/connect`, { toUserId: ids.c }, { "idempotency-key": randomUUID() });
  check("a blocked person cannot be picked (404)", r.status === 404);
  r = await call(cookies.a, "POST", `/events/${E1}/connect`, { toUserId: ids.b }, { "idempotency-key": randomUUID() });
  check("an event that has not happened has no connect window (422 CONNECT_CLOSED)", r.status === 422 && r.body.reason === "CONNECT_CLOSED");
  r = await call(cookies.a, "POST", `/events/${E5}/connect`, { toUserId: ids.b }, { "idempotency-key": randomUUID() });
  check("neither does one past its 48 hours", r.status === 422 && r.body.reason === "CONNECT_CLOSED");

  const keyAB = randomUUID();
  r = await call(cookies.a, "POST", `/events/${E2}/connect`, { toUserId: ids.b }, { "idempotency-key": keyAB });
  check("A picks B: connected, no match yet", r.status === 200 && r.body.status === "connected" && r.body.matched === false);
  r = await call(cookies.a, "POST", `/events/${E2}/connect`, { toUserId: ids.b }, { "idempotency-key": keyAB });
  check("a retry with the same key replays the first answer", r.headers.get("idempotent-replay") === "true");
  check("the database holds one pick, and no match", (await rows(`select 1 from event_connects where "eventId" = $1 and "fromUserId" = $2`, [E2, ids.a])).length === 1 && (await rows(`select 1 from matches where ("userAId" = $1 and "userBId" = $2) or ("userAId" = $2 and "userBId" = $1)`, [ids.a, ids.b])).length === 0);
  r = await call(cookies.a, "GET", `/events/${E2}`);
  check("A's guest list marks B as picked", r.body.guests.find((g) => g.userId === ids.b)?.connected === true);
  r = await call(cookies.b, "GET", `/events/${E2}`);
  check("B is not told that A picked them", r.body.guests.find((g) => g.userId === ids.a)?.connected === false);

  r = await call(cookies.b, "POST", `/events/${E2}/connect`, { toUserId: ids.a }, { "idempotency-key": randomUUID() });
  check("B picks A back: a match is made", r.status === 200 && r.body.matched === true);
  const matchRow = (await rows(`select id, status from matches where ("userAId" = $1 and "userBId" = $2) or ("userAId" = $2 and "userBId" = $1)`, [ids.a, ids.b]))[0];
  check("exactly one Match row exists, with its conversation", Boolean(matchRow) && matchRow.status === "ACTIVE" && (await rows(`select 1 from conversations where "matchId" = $1`, [matchRow.id])).length === 1);
  r = await call(cookies.a, "GET", "/matches");
  const aMatch = r.body.matches.find((m) => m.otherUserId === ids.b);
  r = await call(cookies.b, "GET", "/matches");
  const bMatch = r.body.matches.find((m) => m.otherUserId === ids.a);
  check("both phones list the match with a chat", Boolean(aMatch?.conversationId) && aMatch?.conversationId === bMatch?.conversationId);
  r = await call(cookies.a, "GET", `/chat/${aMatch.conversationId}`);
  check("and the chat opens", r.status === 200);
  r = await call(cookies.a, "GET", `/events/${E2}`);
  check("the guest list now shows B as matched", r.body.guests.find((g) => g.userId === ids.b)?.matched === true);
  r = await call(cookies.a, "POST", `/events/${E2}/connect`, { toUserId: ids.b }, { "idempotency-key": randomUUID() });
  check("picking someone you already match with does not make a second match", r.status === 200 && r.body.matched === false && (await rows(`select 1 from matches where ("userAId" = $1 and "userBId" = $2) or ("userAId" = $2 and "userBId" = $1)`, [ids.a, ids.b])).length === 1);

  r = await call(cookies.b, "POST", `/matches/${matchRow.id}/unmatch`);
  r = await call(cookies.b, "POST", `/events/${E2}/connect`, { toUserId: ids.a }, { "idempotency-key": randomUUID() });
  check("an unmatch is final: picking again never recreates the match", r.status === 200 && r.body.matched === false && (await rows(`select status from matches where id = $1`, [matchRow.id]))[0].status === "UNMATCHED");

  await pool.query(`delete from events where id = any($1)`, [[E1, E2, E3, E4, E5]]);
  await cleanup();
  await pool.end();
  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch(async (e) => {
  console.error("ERROR", e.message);
  await pool.query(`delete from events where title like $1`, [`% ${stamp}`]).catch(() => {});
  await cleanup().catch(() => {});
  await pool.end().catch(() => {});
  process.exit(2);
});
