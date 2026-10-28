// Mobile waves checks (BUILD_PLAN M08) against a running LOCAL stack: the website on localhost with a
// throwaway database that has the reference data imported (shared lists plus the sample campus) and the
// local-development storage folder. Mirrors scripts/check-mobile-picks.mjs's setup.
//   export DATABASE_URL=... DIRECT_URL=... (both localhost) && npm run dev, then:
//   node scripts/check-mobile-waves.mjs
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
const mail = (tag) => `m08.${tag}.${stamp}@test.ac.kr`;
async function cleanup() {
  for (const tag of ["a", "b", "c"]) {
    const email = mail(tag);
    const who = "(select id from users where email = $1)";
    await pool.query(`delete from consents where "userId" = ${who}`, [email]);
    await pool.query(`delete from referrals where "referrerId" = ${who} or "referredUserId" = ${who}`, [email]);
    await pool.query(`delete from audit_log where "actorId" = ${who}`, [email]);
    await pool.query(`delete from users where email = $1`, [email]);
  }
}

(async () => {
  const names = { a: "Ana", b: "Beth", c: "Cleo" };
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

  // ---- who may ask
  let r = await call(undefined, "GET", "/waves");
  check("no session is refused (401)", r.status === 401);

  // ---- wave from a pick (A -> B)
  r = await call(cookies.a, "GET", "/picks");
  const aItems = r.body.intents.find((i) => i.intent === "FRIENDS")?.items ?? [];
  const bCard = aItems.find((i) => i.firstName === names.b);
  if (!bCard) throw new Error("B is not in A's picks — reference-data overlap setup failed");

  r = await call(cookies.a, "POST", `/picks/${bCard.id}/wave`, { note: "same class!" });
  check(
    "waving without an Idempotency-Key is refused (400)",
    r.status === 400 && r.body.fields?.[0]?.name === "Idempotency-Key",
  );
  const keyA = randomUUID();
  r = await call(cookies.a, "POST", `/picks/${bCard.id}/wave`, { note: "same class!" }, { "idempotency-key": keyA });
  check("waving on a pick works (200 sent, not yet matched)", r.status === 200 && r.body.status === "sent" && r.body.matched === false);
  r = await call(cookies.a, "POST", `/picks/${bCard.id}/wave`, { note: "same class!" }, { "idempotency-key": keyA });
  check("a retry with the same key replays the first answer", r.status === 200 && r.headers.get("idempotent-replay") === "true");

  const waveRow = (await pool.query(`select "fromUserId", "toUserId", note, status from waves where "fromUserId" = $1 and "toUserId" = $2`, [ids.a, ids.b])).rows[0];
  check("the database holds one PENDING wave A -> B with the note", waveRow?.status === "PENDING" && waveRow?.note === "same class!");

  r = await call(cookies.a, "GET", "/picks");
  const aAfter = r.body.intents.find((i) => i.intent === "FRIENDS")?.items ?? [];
  check("the waved person is not listed in A's picks any more", !aAfter.some((i) => i.id === bCard.id));

  // ---- the inbox (B sees it)
  r = await call(cookies.b, "GET", "/waves");
  check("no session on /waves gave 401 above; a signed-in call gives 200", r.status === 200);
  const inboxEntry = r.body.waves.find((w) => w.fromUserId === ids.a);
  check(
    "B's inbox lists A's wave, with the note and a profile target",
    Boolean(inboxEntry) && inboxEntry.note === "same class!" && inboxEntry.targetElement.type === "profile" && inboxEntry.firstName === names.a,
  );
  const text = JSON.stringify(r.body);
  check("B's inbox never carries A's email", !text.includes(mail("a")));

  // ---- decline (C declines a wave sent to C from A, proving no match forms)
  const keyAC = randomUUID();
  r = await call(cookies.a, "GET", "/picks");
  const cCard = r.body.intents.find((i) => i.intent === "FRIENDS")?.items.find((i) => i.firstName === names.c);
  if (!cCard) throw new Error("C is not in A's picks — reference-data overlap setup failed");
  await call(cookies.a, "POST", `/picks/${cCard.id}/wave`, {}, { "idempotency-key": keyAC });
  r = await call(cookies.c, "GET", "/waves");
  const waveToC = r.body.waves.find((w) => w.fromUserId === ids.a);
  r = await call(cookies.c, "POST", `/waves/${waveToC.id}/decline`);
  check("declining an incoming wave works (200 declined)", r.status === 200 && r.body.status === "declined");
  const declinedRow = (await pool.query(`select status from waves where id = $1`, [waveToC.id])).rows[0];
  check("the database records it as DECLINED", declinedRow.status === "DECLINED");
  const noMatch = (await pool.query(`select 1 from matches where ("userAId" = $1 and "userBId" = $2) or ("userAId" = $2 and "userBId" = $1)`, [ids.a, ids.c])).rows;
  check("declining never creates a match", noMatch.length === 0);
  r = await call(cookies.c, "POST", `/waves/${waveToC.id}/decline`);
  check("declining an already-decided wave is 422 ALREADY_DECIDED", r.status === 422 && r.body.reason === "ALREADY_DECIDED");

  // ---- wave back forms a match (B waves back at A)
  const keyB = randomUUID();
  r = await call(cookies.b, "POST", `/waves/${inboxEntry.id}/wave-back`, { note: "sounds good" }, { "idempotency-key": keyB });
  check("waving back works and forms a match immediately (200 matched)", r.status === 200 && r.body.status === "matched");
  const matchRow = (await pool.query(`select "userAId", "userBId" from matches where ("userAId" = $1 and "userBId" = $2) or ("userAId" = $2 and "userBId" = $1)`, [ids.a, ids.b])).rows[0];
  check("exactly one Match row exists for A and B", Boolean(matchRow));
  const bothWaves = await pool.query(`select status from waves where ("fromUserId" = $1 and "toUserId" = $2) or ("fromUserId" = $2 and "toUserId" = $1)`, [ids.a, ids.b]);
  check("both wave rows are MATCHED", bothWaves.rows.length === 2 && bothWaves.rows.every((w) => w.status === "MATCHED"));
  r = await call(cookies.b, "GET", "/waves");
  check("the now-matched wave is gone from B's inbox", !r.body.waves.some((w) => w.id === inboxEntry.id));

  // ---- someone else's wave
  r = await call(cookies.c, "POST", `/waves/${randomUUID()}/wave-back`, {}, { "idempotency-key": randomUUID() });
  check("waving back on a wave that does not exist is 404", r.status === 404);
  r = await call(cookies.c, "POST", `/waves/${randomUUID()}/decline`);
  check("declining a wave that does not exist is 404", r.status === 404);

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
