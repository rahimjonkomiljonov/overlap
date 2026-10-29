// Mobile privacy and account checks (BUILD_PLAN M13) against a running LOCAL stack: the website on localhost with a
// throwaway database that has the reference data imported (shared lists plus the sample campus) and the
// local-development storage folder. Mirrors scripts/check-mobile-meetup.mjs's setup.
//   export DATABASE_URL=... DIRECT_URL=... (both localhost) && npm run dev, then:
//   node scripts/check-mobile-privacy.mjs
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
const mail = (tag) => `m13.${tag}.${stamp}@test.ac.kr`;
async function cleanup() {
  for (const tag of ["a", "b", "e", "f", "g"]) {
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



(async () => {
  const names = { a: "Ari", b: "Bex", e: "Eli", f: "Fay" };
  const photo = fs.readFileSync(path.join(ROOT, "e2e/fixtures/photo-with-exif.jpg"));
  const finished = ["a", "b", "e", "f"];
  const cookies = {};
  for (const tag of [...finished, "g"]) cookies[tag] = await signUp(mail(tag));
  for (const tag of finished) {
    // Ari gives the sensitive consent, so there is something to withdraw and to export in the clear.
    const body = { birthYear: 2000, birthMonth: 5, birthDay: 17, attestedAdult: true, termsAccepted: true, sensitivePreference: tag === "a" };
    const r = await call(cookies[tag], "POST", "/onboarding/account", body);
    if (r.status !== 200) throw new Error(`setup failed for ${tag}: ${r.status} ${JSON.stringify(r.body)}`);
  }
  const options = (await call(cookies.a, "GET", "/profile/options")).body;
  for (const tag of finished) await finishProfile(cookies[tag], names[tag], options, photo);
  const r0 = await call(cookies.a, "PUT", "/profile/basics", { firstName: names.a, gender: "WOMAN", year: 2, major: options.majorGroups[1].majors[0].ko, interestedIn: ["MAN"] });
  if (r0.status !== 200) throw new Error(`interestedIn failed: ${r0.status} ${JSON.stringify(r0.body)}`);

  const ids = {};
  for (const tag of [...finished, "g"]) ids[tag] = (await pool.query(`select id from users where email = $1`, [mail(tag)])).rows[0].id;
  globalThis.__ids = ids;
  await pool.query(`update users set "verifiedAt" = now() where id = any($1)`, [[ids.a, ids.b, ids.e, ids.f]]);
  const campusId = (await pool.query(`select "campusId" from users where id = $1`, [ids.a])).rows[0].campusId;
  const courseId = (await pool.query(`select id from courses where "campusId" = $1 limit 1`, [campusId])).rows[0].id;
  for (const tag of finished) {
    const profileId = (await pool.query(`select id from profiles where "userId" = $1`, [ids[tag]])).rows[0].id;
    await pool.query(`insert into profile_courses (id, "profileId", "courseId") values ($1, $2, $3) on conflict do nothing`, [randomUUID(), profileId, courseId]);
  }
  const rows = async (sql, params) => (await pool.query(sql, params)).rows;

  await waveThenMatch(cookies.a, cookies.b, ids.a, ids.b, names.a, names.b, "hi");
  await waveThenMatch(cookies.e, cookies.f, ids.e, ids.f, names.e, names.f, "hi");
  const convAB = (await rows(`select c.id from conversations c join matches m on m.id = c."matchId" where (m."userAId" = $1 and m."userBId" = $2) or (m."userAId" = $2 and m."userBId" = $1)`, [ids.a, ids.b]))[0].id;
  await call(cookies.a, "POST", `/chat/${convAB}/messages`, { text: "secret from Ari" }, { "idempotency-key": randomUUID() });
  await call(cookies.b, "POST", `/chat/${convAB}/messages`, { text: "secret from Bex" }, { "idempotency-key": randomUUID() });

  // ---- who may ask
  let r = await call(undefined, "GET", "/privacy");
  check("no session is refused (401)", r.status === 401);
  r = await call(cookies.g, "GET", "/privacy");
  check("a person who has not finished account setup can still open the privacy overview (200)", r.status === 200 && Array.isArray(r.body.consents));
  r = await call(cookies.a, "GET", "/privacy");
  const types = Object.fromEntries(r.body.consents.map((c) => [c.type, c]));
  check("the overview lists consents: Terms and Privacy are not withdrawable, the sensitive one is, and is in force", r.status === 200 && types.TERMS?.withdrawable === false && types.PRIVACY_POLICY?.withdrawable === false && types.SENSITIVE_PREFERENCE?.withdrawable === true && types.SENSITIVE_PREFERENCE?.active === true);
  check("and an empty request history to start with", r.body.dataRequests.length === 0);

  // ---- download my data
  r = await call(cookies.a, "GET", "/privacy/export");
  const exp = r.body;
  check("the export is ready (200) with the caller's own account", r.status === 200 && exp.data?.account?.email === mail("a"));
  const text = JSON.stringify(exp.data);
  check("it includes the sensitive 'who I'd like to meet' field in clear text (the owner's own access request)", JSON.stringify(exp.data.profile?.interestedIn ?? null).includes("MAN"));
  check("it holds the caller's own chat message but never the other person's", text.includes("secret from Ari") && !text.includes("secret from Bex"));
  check("and never the other person's email or user id", !text.includes(mail("b")) && !text.includes(ids.b));
  const access = await rows(`select status, type from data_requests where "userId" = $1 and type = 'ACCESS'`, [ids.a]);
  check("a completed ACCESS request is on record", access.length === 1 && access[0].status === "COMPLETED");
  r = await call(cookies.b, "GET", "/privacy/export");
  check("the other person's export carries only their own message", !JSON.stringify(r.body.data).includes("secret from Ari") && JSON.stringify(r.body.data).includes("secret from Bex"));

  // ---- consent withdrawal
  r = await call(cookies.a, "POST", "/privacy/consents/withdraw", { type: "TERMS" });
  check("a required consent cannot be withdrawn (400)", r.status === 400);
  r = await call(cookies.a, "POST", "/privacy/consents/withdraw", {});
  check("a missing type is refused (400)", r.status === 400);
  r = await call(cookies.a, "POST", "/privacy/consents/withdraw", { type: "MARKETING" });
  check("withdrawing a consent that was never given is 422 NOT_ACTIVE", r.status === 422 && r.body.reason === "NOT_ACTIVE");
  check("the stored field is still there before withdrawing", (await rows(`select "interestedIn" from profiles where "userId" = $1`, [ids.a]))[0].interestedIn !== null);
  r = await call(cookies.a, "POST", "/privacy/consents/withdraw", { type: "SENSITIVE_PREFERENCE" });
  check("withdrawing the sensitive consent works (200)", r.status === 200 && r.body.status === "withdrawn");
  check("the stored 'who I'd like to meet' field is deleted at once", (await rows(`select "interestedIn" from profiles where "userId" = $1`, [ids.a]))[0].interestedIn === null);
  check("the consent row is marked withdrawn, with its date", (await rows(`select "withdrawnAt" from consents where "userId" = $1 and type = 'SENSITIVE_PREFERENCE'`, [ids.a]))[0].withdrawnAt !== null);
  check("a WITHDRAWAL request is recorded", (await rows(`select 1 from data_requests where "userId" = $1 and type = 'WITHDRAWAL' and status = 'COMPLETED'`, [ids.a])).length === 1);
  r = await call(cookies.a, "GET", "/privacy");
  check("the overview now shows it withdrawn, and both requests", r.body.consents.find((c) => c.type === "SENSITIVE_PREFERENCE")?.active === false && r.body.dataRequests.length === 2);
  r = await call(cookies.a, "POST", "/privacy/consents/withdraw", { type: "SENSITIVE_PREFERENCE" });
  check("withdrawing again is 422 NOT_ACTIVE", r.status === 422 && r.body.reason === "NOT_ACTIVE");
  r = await call(cookies.a, "GET", "/privacy/export");
  check("and the export no longer holds the field", r.body.data.profile?.interestedIn === null || r.body.data.profile?.interestedIn === undefined);

  // ---- pick preferences
  r = await call(cookies.a, "GET", "/preferences/matching");
  check("the sliders start neutral, with their range", r.status === 200 && r.body.classes === 1 && r.body.interests === 1 && r.body.freeTime === 1 && r.body.min === 0.5 && r.body.max === 1.5 && r.body.step === 0.25);
  for (const bad of [{ classes: 2, interests: 1, freeTime: 1 }, { classes: 1.1, interests: 1, freeTime: 1 }, { classes: "1", interests: 1, freeTime: 1 }, { classes: 1, interests: 1 }]) {
    r = await call(cookies.a, "PUT", "/preferences/matching", bad);
    check(`a slider that is out of range, off its steps, not a number or missing is refused (400): ${JSON.stringify(bad)}`, r.status === 400);
  }
  r = await call(cookies.a, "PUT", "/preferences/matching", { classes: 1.5, interests: 0.5, freeTime: 1.25 });
  check("saving valid sliders works (200)", r.status === 200 && r.body.status === "saved");
  const w = (await rows(`select "weightClasses", "weightInterests", "weightFreeTime" from profiles where "userId" = $1`, [ids.a]))[0];
  check("the database holds them on the caller's own profile", w.weightClasses === 1.5 && w.weightInterests === 0.5 && w.weightFreeTime === 1.25);
  r = await call(cookies.a, "GET", "/preferences/matching");
  check("and the screen reads them back", r.body.classes === 1.5 && r.body.interests === 0.5 && r.body.freeTime === 1.25);
  check("another person's sliders are untouched", (await rows(`select "weightClasses" from profiles where "userId" = $1`, [ids.b]))[0].weightClasses === 1);

  // ---- a restricted account keeps its privacy rights
  await pool.query(`update users set status = 'SUSPENDED', "suspendedUntil" = ((now() at time zone 'utc') + interval '7 days') where id = $1`, [ids.a]);
  r = await call(cookies.a, "GET", "/privacy");
  check("a suspended person can still open the privacy overview", r.status === 200);
  r = await call(cookies.a, "GET", "/privacy/export");
  check("and download their data", r.status === 200 && r.body.data.account.email === mail("a"));
  r = await call(cookies.a, "GET", "/preferences/matching");
  check("but the rest of the app, such as the sliders, is closed to them (403)", r.status === 403);
  await pool.query(`update users set status = 'ACTIVE', "suspendedUntil" = null where id = $1`, [ids.a]);

  // ---- account deletion: phase one (the request) ...
  r = await call(cookies.f, "GET", "/matches");
  check("before deleting, Fay lists a match with Eli", r.body.matches.some((m) => m.otherUserId === ids.e));
  await pool.query(`update users set status = 'SUSPENDED', "suspendedUntil" = ((now() at time zone 'utc') + interval '7 days') where id = $1`, [ids.e]);
  const eliBefore = (await rows(`select email, name, "birthYear" from users where id = $1`, [ids.e]))[0];
  const eliPhotos = (await rows(`select count(*)::int as n from photos where "profileId" = (select id from profiles where "userId" = $1)`, [ids.e]))[0].n;
  r = await call(cookies.e, "POST", "/privacy/delete", {});
  check("deleting without a confirmation is refused (400)", r.status === 400);
  r = await call(cookies.e, "POST", "/privacy/delete", { confirm: false });
  check("so is a false confirmation", r.status === 400);
  check("nothing changed yet", (await rows(`select status from users where id = $1`, [ids.e]))[0].status === "SUSPENDED");
  r = await call(cookies.e, "POST", "/privacy/delete", { confirm: true });
  check("a suspended person can delete their account (200)", r.status === 200 && r.body.status === "deleted");
  const days = (new Date(r.body.purgeAfter).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  check("it says the data is scrubbed in 30 days", days > 29.9 && days < 30.1);
  const eli = (await rows(`select status, "deletedAt", email, name, "birthYear", "purgedAt" from users where id = $1`, [ids.e]))[0];
  check("phase one flags the account DELETED with a date and nothing else", eli.status === "DELETED" && eli.deletedAt !== null && eli.purgedAt === null);
  check("the personal data is untouched during the grace period (email, name, birth year, profile, photos)", eli.email === eliBefore.email && eli.name === eliBefore.name && eli.birthYear === eliBefore.birthYear && (await rows(`select 1 from profiles where "userId" = $1`, [ids.e])).length === 1 && (await rows(`select count(*)::int as n from photos where "profileId" = (select id from profiles where "userId" = $1)`, [ids.e]))[0].n === eliPhotos);
  check("a completed DELETION request is on record", (await rows(`select 1 from data_requests where "userId" = $1 and type = 'DELETION' and status = 'COMPLETED'`, [ids.e])).length === 1);
  r = await call(cookies.e, "GET", "/privacy");
  check("the session is signed out at once (401)", r.status === 401);
  r = await call(cookies.f, "GET", "/matches");
  check("and the other person no longer sees the match", !r.body.matches.some((m) => m.otherUserId === ids.e));

  // ... and phase two (the scrub, 30 days later)
  const cron = async () => {
    const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
    const secret = /^CRON_SECRET=(.+)$/m.exec(env)?.[1]?.trim();
    const res = await fetch(`${BASE}/api/cron/retention`, { headers: { authorization: `Bearer ${secret}` } });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  r = await cron();
  check("the retention job does not touch an account still inside its grace period", r.status === 200 && (await rows(`select email from users where id = $1`, [ids.e]))[0].email === eliBefore.email);
  await pool.query(`update users set "deletedAt" = ((now() at time zone 'utc') - interval '29 days') where id = $1`, [ids.e]);
  await cron();
  check("29 days in, still untouched", (await rows(`select email, "purgedAt" from users where id = $1`, [ids.e]))[0].email === eliBefore.email);
  await pool.query(`update users set "deletedAt" = ((now() at time zone 'utc') - interval '31 days') where id = $1`, [ids.e]);
  r = await cron();
  check("31 days in, the retention job scrubs it", r.status === 200 && r.body.accounts >= 1);
  const scrubbed = (await rows(`select email, name, "birthYear", image, "purgedAt", status from users where id = $1`, [ids.e]))[0];
  check("the email becomes a placeholder, the name and birth year go", scrubbed.email === `deleted-${ids.e}@purged.invalid` && scrubbed.name === "Deleted user" && scrubbed.birthYear === null && scrubbed.image === null && scrubbed.purgedAt !== null);
  check("the profile and its photos are removed", (await rows(`select 1 from profiles where "userId" = $1`, [ids.e])).length === 0);
  check("but the User row itself stays, since matches and messages still point at it", scrubbed.status === "DELETED");

  // ---- deleting before account setup is finished
  r = await call(cookies.g, "POST", "/privacy/delete", { confirm: true });
  check("someone who never finished account setup can delete their account too (200)", r.status === 200 && (await rows(`select status from users where id = $1`, [ids.g]))[0].status === "DELETED");

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
