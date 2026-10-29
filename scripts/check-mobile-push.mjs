// Mobile push notification checks (BUILD_PLAN M14) against a running LOCAL stack: the website on localhost with a
// throwaway database that has the reference data imported (shared lists plus the sample campus) and the
// local-development storage folder. Mirrors scripts/check-mobile-meetup.mjs's setup.
//   export DATABASE_URL=... DIRECT_URL=... (both localhost) && npm run dev, then:
//   node scripts/check-mobile-push.mjs
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
const mail = (tag) => `m14.${tag}.${stamp}@test.ac.kr`;
async function cleanup() {
  for (const tag of ["a", "b", "g"]) {
    const email = mail(tag);
    if (globalThis.__ids?.[tag]) await pool.query(`update users set email = $2 where id = $1`, [globalThis.__ids[tag], email]);
    const who = "(select id from users where email = $1)";
    await pool.query(`delete from moderation_actions where "actorId" = ${who}`, [email]);
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



const PUSH_LOG = path.join(ROOT, ".dev-push.jsonl");
const TOKEN_A = `ExponentPushToken[m14a${stamp}_phone-aaaa]`;
const TOKEN_B = `ExponentPushToken[m14b${stamp}_phone-bbbb]`;
const pushLines = () => (fs.existsSync(PUSH_LOG) ? fs.readFileSync(PUSH_LOG, "utf8").trim().split("\n").filter(Boolean) : []);

(async () => {
  const names = { a: "Ari", b: "Bex" };
  const photo = fs.readFileSync(path.join(ROOT, "e2e/fixtures/photo-with-exif.jpg"));
  const cookies = {};
  for (const tag of ["a", "b", "g"]) cookies[tag] = await signUp(mail(tag));
  for (const tag of ["a", "b"]) {
    const r = await call(cookies[tag], "POST", "/onboarding/account", { birthYear: 2000, birthMonth: 5, birthDay: 17, attestedAdult: true, termsAccepted: true, sensitivePreference: false });
    if (r.status !== 200) throw new Error(`setup failed for ${tag}: ${r.status}`);
  }
  const options = (await call(cookies.a, "GET", "/profile/options")).body;
  for (const tag of ["a", "b"]) await finishProfile(cookies[tag], names[tag], options, photo);

  const ids = {};
  for (const tag of ["a", "b", "g"]) ids[tag] = (await pool.query(`select id from users where email = $1`, [mail(tag)])).rows[0].id;
  globalThis.__ids = ids;
  await pool.query(`update users set "verifiedAt" = now() where id = any($1)`, [[ids.a, ids.b]]);
  const campusId = (await pool.query(`select "campusId" from users where id = $1`, [ids.a])).rows[0].campusId;
  const courseId = (await pool.query(`select id from courses where "campusId" = $1 limit 1`, [campusId])).rows[0].id;
  for (const tag of ["a", "b"]) {
    const profileId = (await pool.query(`select id from profiles where "userId" = $1`, [ids[tag]])).rows[0].id;
    await pool.query(`insert into profile_courses (id, "profileId", "courseId") values ($1, $2, $3) on conflict do nothing`, [randomUUID(), profileId, courseId]);
  }
  const rows = async (sql, params) => (await pool.query(sql, params)).rows;
  const tokensOf = async (id) => (await rows(`select endpoint, p256dh from push_subscriptions where "userId" = $1`, [id])).map((x) => x.endpoint);

  // ---- who may use it, and what it accepts
  let r = await call(undefined, "GET", "/push");
  check("no session is refused (401)", r.status === 401);
  r = await call(cookies.g, "GET", "/push");
  check("someone who has not finished account setup is refused (403)", r.status === 403);
  r = await call(cookies.a, "GET", "/push");
  check("to start with push is off and no phone is registered", r.status === 200 && r.body.enabled === false && r.body.devices === 0);
  r = await call(cookies.a, "PUT", "/push/device", { token: "https://fcm.googleapis.com/fcm/send/abc" });
  check("a browser push address is refused as a phone token (400)", r.status === 400);
  r = await call(cookies.a, "PUT", "/push/device", { token: "not-a-token" });
  check("a made-up token is refused (400)", r.status === 400);
  r = await call(cookies.a, "PUT", "/push/device", { token: TOKEN_A, userId: ids.b });
  check("an extra field is refused (400)", r.status === 400);
  check("nothing was saved by the refused calls", (await tokensOf(ids.a)).length === 0);

  // ---- opt in
  r = await call(cookies.a, "PUT", "/push/device", { token: TOKEN_A });
  check("a valid Expo token is saved (200)", r.status === 200 && r.body.status === "registered");
  r = await call(cookies.a, "PUT", "/push/device", { token: TOKEN_A });
  check("saving it again changes nothing", r.status === 200 && (await tokensOf(ids.a)).length === 1);
  r = await call(cookies.a, "GET", "/push");
  check("push now reads as on, with one phone", r.body.enabled === true && r.body.devices === 1);
  const stored = (await rows(`select p256dh, auth from push_subscriptions where endpoint = $1`, [TOKEN_A]))[0];
  check("it is stored beside browser subscriptions, marked as a phone", stored.p256dh === "expo" && stored.auth === "expo");

  // ---- one person cannot touch another's phone
  r = await call(cookies.b, "DELETE", "/push/device", { token: TOKEN_A });
  check("another person removing it does nothing to it", r.status === 200 && (await tokensOf(ids.a)).includes(TOKEN_A));
  r = await call(cookies.b, "PUT", "/push/device", { token: TOKEN_B });
  check("the other person registers their own phone", r.status === 200 && (await tokensOf(ids.b)).includes(TOKEN_B));

  // ---- opt out and in again
  r = await call(cookies.a, "DELETE", "/push/device", { token: TOKEN_A });
  check("opting out removes the caller's own token", r.status === 200 && (await tokensOf(ids.a)).length === 0);
  r = await call(cookies.a, "GET", "/push");
  check("push reads as off again", r.body.enabled === false);
  r = await call(cookies.a, "DELETE", "/push/device", { token: TOKEN_A });
  check("opting out twice is harmless (200)", r.status === 200);
  await call(cookies.a, "PUT", "/push/device", { token: TOKEN_A });

  // ---- a match queues a notification; the cron job delivers it as a generic push (logged locally, never to Expo)
  await waveThenMatch(cookies.a, cookies.b, ids.a, ids.b, names.a, names.b, "hi");
  const queued = await rows(`select type, status from notifications where "userId" = any($1)`, [[ids.a, ids.b]]);
  check("matching queued a MATCH notification for each person (not sent on the spot)", queued.filter((n) => n.type === "MATCH" && n.status === "QUEUED").length === 2);
  const before = pushLines().length;
  const cron = await fetch(`${BASE}/api/cron/notifications`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  const result = await cron.json();
  const quiet = result.deferred === true;
  if (quiet) {
    check("it is quiet hours in Seoul now, so the job sent nothing and the notifications still wait", result.sent === 0 && (await rows(`select 1 from notifications where "userId" = any($1) and status = 'QUEUED'`, [[ids.a, ids.b]])).length === 2);
  } else {
    check("the job ran outside quiet hours and sent", cron.status === 200 && result.sent >= 2 && result.pushed >= 2);
    const fresh = pushLines().slice(before).map((l) => JSON.parse(l));
    const toA = fresh.find((l) => l.endpoint === TOKEN_A);
    const toB = fresh.find((l) => l.endpoint === TOKEN_B);
    check("each phone got a push", !!toA && !!toB);
    const blob = JSON.stringify([toA, toB]);
    check("the push text is generic: no names, no message text, no who-I'd-like-to-meet", !/Ari|Bex|secret|interested/i.test(blob.replace(/ExponentPushToken\[[^\]]*\]/g, "")));
    check("it carries the screen to open (matches)", /\/matches$/.test(toA?.url ?? ""));
    check("the notifications are marked sent", (await rows(`select 1 from notifications where "userId" = any($1) and status = 'SENT'`, [[ids.a, ids.b]])).length >= 2);
  }

  // ---- a phone moves with its token
  r = await call(cookies.b, "PUT", "/push/device", { token: TOKEN_A });
  check("a token registered by someone else on the same phone moves to them", r.status === 200 && (await tokensOf(ids.a)).length === 0 && (await tokensOf(ids.b)).includes(TOKEN_A));

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
