// Mobile matches and chat checks (BUILD_PLAN M09) against a running LOCAL stack: the website on
// localhost with a throwaway database that has the reference data imported (shared lists plus the
// sample campus) and the local-development storage folder. Mirrors scripts/check-mobile-waves.mjs's setup.
//   export DATABASE_URL=... DIRECT_URL=... (both localhost) && npm run dev, then:
//   node scripts/check-mobile-chat.mjs
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
const mail = (tag) => `m09.${tag}.${stamp}@test.ac.kr`;
async function cleanup() {
  for (const tag of ["a", "b", "c"]) {
    const email = mail(tag);
    const who = "(select id from users where email = $1)";
    await pool.query(`delete from messages where "senderId" = ${who}`, [email]);
    await pool.query(`delete from consents where "userId" = ${who}`, [email]);
    await pool.query(`delete from referrals where "referrerId" = ${who} or "referredUserId" = ${who}`, [email]);
    await pool.query(`delete from audit_log where "actorId" = ${who}`, [email]);
    await pool.query(`delete from users where email = $1`, [email]);
  }
}

async function waveThenMatch(cookieFrom, cookieTo, fromId, toId, fromName, toName, note) {
  const r1 = await call(cookieFrom, "GET", "/picks");
  const card = r1.body.intents.find((i) => i.intent === "FRIENDS")?.items.find((i) => i.firstName === toName);
  if (!card) throw new Error(`${toName} is not in ${fromName}'s picks — reference-data overlap setup failed`);
  await call(cookieFrom, "POST", `/picks/${card.id}/wave`, { note }, { "idempotency-key": randomUUID() });
  const r2 = await call(cookieTo, "GET", "/waves");
  const inboxEntry = r2.body.waves.find((w) => w.fromUserId === fromId);
  if (!inboxEntry) throw new Error(`${toName}'s inbox never got ${fromName}'s wave`);
  const r3 = await call(cookieTo, "POST", `/waves/${inboxEntry.id}/wave-back`, {}, { "idempotency-key": randomUUID() });
  if (r3.body.status !== "matched") throw new Error(`wave-back did not match ${fromName} and ${toName}: ${JSON.stringify(r3.body)}`);
}

(async () => {
  const names = { a: "Aria", b: "Bryn", c: "Cora" };
  const photo = fs.readFileSync(path.join(ROOT, "e2e/fixtures/photo-with-exif.jpg"));

  const cookies = {};
  for (const tag of ["a", "b", "c"]) {
    cookies[tag] = await signUp(mail(tag));
    const r = await setup(cookies[tag]);
    if (r.status !== 200) throw new Error(`setup failed for ${tag}: ${r.status}`);
  }
  const options = (await call(cookies.a, "GET", "/profile/options")).body;
  for (const tag of ["a", "b", "c"]) await finishProfile(cookies[tag], names[tag], options, photo);

  const ids = {};
  for (const tag of ["a", "b", "c"]) {
    ids[tag] = (await pool.query(`select id from users where email = $1`, [mail(tag)])).rows[0].id;
  }
  await pool.query(`update users set "verifiedAt" = now() where id = any($1)`, [[ids.a, ids.b, ids.c]]);
  const campusId = (await pool.query(`select "campusId" from users where id = $1`, [ids.a])).rows[0].campusId;
  const courseId = (await pool.query(`select id from courses where "campusId" = $1 limit 1`, [campusId])).rows[0].id;
  for (const tag of ["a", "b", "c"]) {
    const profileId = (await pool.query(`select id from profiles where "userId" = $1`, [ids[tag]])).rows[0].id;
    await pool.query(`insert into profile_courses (id, "profileId", "courseId") values ($1, $2, $3) on conflict do nothing`, [randomUUID(), profileId, courseId]);
  }

  // A and B share a course and form a match (gives real course-based icebreakers).
  await waveThenMatch(cookies.a, cookies.b, ids.a, ids.b, names.a, names.b, "same class!");
  const matchRow = (await pool.query(`select id, "userAId", "userBId" from matches where ("userAId" = $1 and "userBId" = $2) or ("userAId" = $2 and "userBId" = $1)`, [ids.a, ids.b])).rows[0];
  const matchId = matchRow.id;
  const conversationRow = (await pool.query(`select id from conversations where "matchId" = $1`, [matchId])).rows[0];
  const conversationId = conversationRow.id;

  // ---- who may ask
  let r = await call(undefined, "GET", "/matches");
  check("no session on /matches is refused (401)", r.status === 401);
  r = await call(undefined, "GET", `/chat/${conversationId}`);
  check("no session on /chat/{id} is refused (401)", r.status === 401);

  // ---- matches list
  r = await call(cookies.a, "GET", "/matches");
  let entry = r.body.matches.find((m) => m.matchId === matchId);
  check("A's matches list has B, with this conversation id", entry?.conversationId === conversationId && entry?.firstName === names.b);
  check("A's matches list never carries B's email", !JSON.stringify(r.body).includes(mail("b")));

  r = await call(cookies.b, "GET", "/matches");
  check("B's matches list has A too", r.body.matches.some((m) => m.matchId === matchId && m.firstName === names.a));

  // ---- chat detail before any message: real shared-overlap icebreakers, composer enabled
  r = await call(cookies.a, "GET", `/chat/${conversationId}`);
  check("the thread opens for A (200)", r.status === 200);
  check("no messages yet", r.body.messages.length === 0);
  check("canInteract is true on a fresh match", r.body.canInteract === true);
  // A and B share both a course and identical values-quiz answers; which reason ranks top is the
  // matching engine's own call (S10), not this script's — the real proof is that a reason came
  // from the actual shared-overlap pipeline (a real type the server knows about), not a hardcoded
  // generic fallback, which only ever shows once the thread already has a message.
  const REASON_TYPES = ["course", "club", "interest", "freeTime", "values"];
  check(
    "icebreakers reflect a real shared-overlap reason, since the match formed from a real pick wave",
    r.body.icebreakers.length > 0 && r.body.icebreakers.every((i) => REASON_TYPES.includes(i.type)),
    `icebreakers=${JSON.stringify(r.body.icebreakers)}`,
  );

  // ---- someone else's conversation, or one that does not exist
  r = await call(cookies.c, "GET", `/chat/${conversationId}`);
  check("a conversation that is not the caller's is 404, not 403 (never confirms it exists)", r.status === 404);
  r = await call(cookies.a, "GET", `/chat/${randomUUID()}`);
  check("a conversation that does not exist is 404", r.status === 404);

  // ---- sending a message
  r = await call(cookies.a, "POST", `/chat/${conversationId}/messages`, { text: "hey!" });
  check("sending without an Idempotency-Key is refused (400)", r.status === 400 && r.body.fields?.[0]?.name === "Idempotency-Key");
  const keyA = randomUUID();
  r = await call(cookies.a, "POST", `/chat/${conversationId}/messages`, { text: "hey, want to study together?" }, { "idempotency-key": keyA });
  check("sending a message works (200 sent)", r.status === 200 && r.body.status === "sent" && r.body.message.senderId === ids.a);
  r = await call(cookies.a, "POST", `/chat/${conversationId}/messages`, { text: "hey, want to study together?" }, { "idempotency-key": keyA });
  check("a retry with the same key replays the first answer", r.status === 200 && r.headers.get("idempotent-replay") === "true");

  const messageRow = (await pool.query(`select "senderId", text from messages where "conversationId" = $1`, [conversationId])).rows[0];
  check("the database holds the message with its real text", messageRow?.senderId === ids.a && messageRow?.text === "hey, want to study together?");

  // ---- B sees it, and icebreakers stop showing once the thread has a message
  r = await call(cookies.b, "GET", `/chat/${conversationId}`);
  check("B's thread shows A's message", r.body.messages.some((m) => m.text === "hey, want to study together?" && m.senderId === ids.a));
  check("icebreakers are empty once the thread has a message", r.body.icebreakers.length === 0);

  const keyB = randomUUID();
  r = await call(cookies.b, "POST", `/chat/${conversationId}/messages`, { text: "sure, when works?" }, { "idempotency-key": keyB });
  check("B can reply", r.status === 200 && r.body.status === "sent");
  r = await call(cookies.a, "GET", `/chat/${conversationId}`);
  check("A sees B's reply", r.body.messages.some((m) => m.text === "sure, when works?" && m.senderId === ids.b));

  // ---- expiry and the one revive
  await pool.query(`update conversations set status = 'EXPIRED', "lastMessageAt" = now() - interval '8 days' where id = $1`, [conversationId]);
  r = await call(cookies.a, "GET", `/chat/${conversationId}`);
  check("an expired conversation reports EXPIRED and canInteract false", r.body.status === "EXPIRED" && r.body.canInteract === false);
  r = await call(cookies.a, "POST", `/chat/${conversationId}/messages`, { text: "still there?" }, { "idempotency-key": randomUUID() });
  check("sending into an expired conversation is 422 EXPIRED", r.status === 422 && r.body.reason === "EXPIRED");

  r = await call(cookies.a, "POST", `/chat/${conversationId}/revive`);
  check("reviving an expired conversation works", r.status === 200 && r.body.status === "revived");
  r = await call(cookies.a, "GET", `/chat/${conversationId}`);
  check("after reviving, the thread is ACTIVE again and canInteract is true", r.body.status === "ACTIVE" && r.body.canInteract === true);
  r = await call(cookies.a, "POST", `/chat/${conversationId}/revive`);
  check("reviving an ACTIVE (not actually expired) conversation is 422 NOT_EXPIRED", r.status === 422 && r.body.reason === "NOT_EXPIRED");

  // Expires a second time (another silent stretch) — revivedAt is still set from the first
  // revive, so this is the real "one revive ever" rule, not just "not currently expired".
  await pool.query(`update conversations set status = 'EXPIRED', "lastMessageAt" = now() - interval '8 days' where id = $1`, [conversationId]);
  r = await call(cookies.a, "POST", `/chat/${conversationId}/revive`);
  check("reviving a second time is 422 ALREADY_REVIVED", r.status === 422 && r.body.reason === "ALREADY_REVIVED");

  // ---- a blocked pair: A and C matched too, then C blocks A
  await waveThenMatch(cookies.a, cookies.c, ids.a, ids.c, names.a, names.c, undefined);
  const matchAC = (await pool.query(`select id from matches where ("userAId" = $1 and "userBId" = $2) or ("userAId" = $2 and "userBId" = $1)`, [ids.a, ids.c])).rows[0];
  const conversationAC = (await pool.query(`select id from conversations where "matchId" = $1`, [matchAC.id])).rows[0].id;
  await pool.query(`insert into blocks (id, "blockerId", "blockedId") values ($1, $2, $3)`, [randomUUID(), ids.c, ids.a]);

  r = await call(cookies.a, "POST", `/chat/${conversationAC}/messages`, { text: "hi?" }, { "idempotency-key": randomUUID() });
  check("a blocked user cannot send: the conversation is 404 once blocked, from the blocked side", r.status === 404);
  r = await call(cookies.c, "GET", "/matches");
  check("a blocked match is hidden from the blocker's own matches list too", !r.body.matches.some((m) => m.matchId === matchAC.id));

  // ---- unmatch
  r = await call(cookies.b, "POST", `/matches/${randomUUID()}/unmatch`);
  check("unmatching a match that does not exist is 404", r.status === 404);
  r = await call(cookies.b, "POST", `/matches/${matchId}/unmatch`);
  check("unmatching works (200 unmatched)", r.status === 200 && r.body.status === "unmatched");
  const unmatchedRow = (await pool.query(`select status, "unmatchedByUserId" from matches where id = $1`, [matchId])).rows[0];
  check("the database records who unmatched", unmatchedRow.status === "UNMATCHED" && unmatchedRow.unmatchedByUserId === ids.b);
  r = await call(cookies.a, "GET", "/matches");
  check("the unmatched person is gone from A's matches list too", !r.body.matches.some((m) => m.matchId === matchId));
  r = await call(cookies.a, "POST", `/chat/${conversationId}/messages`, { text: "hello?" }, { "idempotency-key": randomUUID() });
  check("sending into an unmatched conversation is 422 UNMATCHED", r.status === 422 && r.body.reason === "UNMATCHED");
  r = await call(cookies.b, "POST", `/matches/${matchId}/unmatch`);
  check("unmatching a second time is 422 ALREADY_DECIDED", r.status === 422 && r.body.reason === "ALREADY_DECIDED");

  await cleanup();
  await pool.end();
  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch(async (e) => {
  console.error("ERROR", e.message);
  await cleanup().catch(() => {});
  await pool.end().catch(() => {});
  process.exit(2);
});
