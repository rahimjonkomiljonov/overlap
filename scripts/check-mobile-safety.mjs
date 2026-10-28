// Mobile safety checks (BUILD_PLAN M12) against a running LOCAL stack: the website on localhost with a
// throwaway database that has the reference data imported (shared lists plus the sample campus) and the
// local-development storage folder. Mirrors scripts/check-mobile-meetup.mjs's setup.
//   export DATABASE_URL=... DIRECT_URL=... (both localhost) && npm run dev, then:
//   node scripts/check-mobile-safety.mjs
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
const mail = (tag) => `m12.${tag}.${stamp}@test.ac.kr`;
async function cleanup() {
  for (const tag of ["a", "b", "c"]) {
    const email = mail(tag);
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
  const names = { a: "Ada", b: "Bo", c: "Cy" };
  const photo = fs.readFileSync(path.join(ROOT, "e2e/fixtures/photo-with-exif.jpg"));
  const tags = ["a", "b", "c"];

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
  await pool.query(`update users set "verifiedAt" = now() where id = any($1)`, [[ids.a, ids.b, ids.c]]);
  const campusId = (await pool.query(`select "campusId" from users where id = $1`, [ids.a])).rows[0].campusId;
  const course = (await pool.query(`select id, code from courses where "campusId" = $1 limit 1`, [campusId])).rows[0];
  const club = (await pool.query(`select id from clubs where "campusId" = $1 limit 1`, [campusId])).rows[0];
  const profileOf = async (tag) => (await pool.query(`select id from profiles where "userId" = $1`, [ids[tag]])).rows[0].id;
  for (const tag of tags) {
    await pool.query(`insert into profile_courses (id, "profileId", "courseId") values ($1, $2, $3) on conflict do nothing`, [randomUUID(), await profileOf(tag), course.id]);
  }
  for (const tag of ["a", "c"]) {
    await pool.query(`insert into profile_clubs (id, "profileId", "clubId") values ($1, $2, $3) on conflict do nothing`, [randomUUID(), await profileOf(tag), club.id]);
  }
  const rows = async (sql, params) => (await pool.query(sql, params)).rows;
  const setStatus = (status) => pool.query(`update users set status = $2::"UserStatus" where id = $1`, [ids.a, status]);

  await waveThenMatch(cookies.a, cookies.b, ids.a, ids.b, names.a, names.b, "same class!");
  const matchId = (await rows(`select id from matches where ("userAId" = $1 and "userBId" = $2) or ("userAId" = $2 and "userBId" = $1)`, [ids.a, ids.b]))[0].id;
  const conversationId = (await rows(`select id from conversations where "matchId" = $1`, [matchId]))[0].id;
  for (const tag of tags) await call(cookies[tag], "PUT", "/pockets/visibility", { visible: true });

  const inPicks = async (tag, otherTag) => {
    const body = (await call(cookies[tag], "GET", "/picks")).body;
    return (body.intents ?? []).some((i) => i.items.some((x) => x.firstName === names[otherTag]));
  };
  const inPocket = async (tag, otherTag) => {
    const pockets = (await call(cookies[tag], "GET", "/pockets")).body.pockets ?? [];
    for (const p of pockets) {
      const detail = (await call(cookies[tag], "GET", `/pockets/${p.kind}/${p.id}`)).body;
      if ((detail.members ?? []).some((m) => m.firstName === names[otherTag])) return true;
    }
    return false;
  };

  // ---- who may ask, and the starting state
  let r = await call(undefined, "GET", "/safety");
  check("no session is refused (401)", r.status === 401);
  r = await call(cookies.a, "GET", "/safety");
  check("the safety screen opens (200) with nothing blocked or hidden", r.status === 200 && r.body.status === "ACTIVE" && r.body.paused === false && r.body.incognito === false && r.body.blocked.length === 0 && r.body.hidden.length === 0);
  check("it lists my own course for hide-from, and my club", r.body.courses.some((c) => c.id === course.id && c.code === course.code) && r.body.clubs.some((c) => c.id === club.id));
  check("there are no actions on the account and no reach limit", r.body.actions.length === 0 && r.body.trust.limited === false);
  check("the starting state: C is in A's picks and A's pocket", (await inPicks("a", "c")) && (await inPocket("a", "c")));

  // ---- pause, and the restricted states
  r = await call(cookies.a, "PUT", "/safety/paused", { paused: "yes" });
  check("a pause body that is not a boolean is refused (400)", r.status === 400);
  r = await call(cookies.a, "PUT", "/safety/paused", { paused: true });
  check("pausing works (200)", r.status === 200 && r.body.paused === true);
  check("the database holds PAUSED", (await rows(`select status from users where id = $1`, [ids.a]))[0].status === "PAUSED");
  r = await call(cookies.a, "GET", "/safety");
  check("a paused person can still open the safety screen and sees paused", r.status === 200 && r.body.paused === true && r.body.status === "PAUSED");
  r = await call(cookies.a, "GET", "/picks");
  check("but the rest of the app is closed to them (403 ACCOUNT_RESTRICTED)", r.status === 403 && r.body.error === "ACCOUNT_RESTRICTED");
  r = await call(cookies.a, "PUT", "/safety/paused", { paused: false });
  check("and they can unpause (200)", r.status === 200 && (await rows(`select status from users where id = $1`, [ids.a]))[0].status === "ACTIVE");

  await pool.query(`update users set status = 'SUSPENDED', "suspendedUntil" = ((now() at time zone 'utc') + interval '7 days') where id = $1`, [ids.a]);
  r = await call(cookies.a, "GET", "/safety");
  check("a suspended person sees why: SUSPENDED with an end date", r.status === 200 && r.body.status === "SUSPENDED" && Boolean(r.body.suspendedUntil));
  r = await call(cookies.a, "PUT", "/safety/paused", { paused: false });
  check("they cannot un-suspend themselves (422 ACCOUNT_RESTRICTED)", r.status === 422 && r.body.reason === "ACCOUNT_RESTRICTED" && (await rows(`select status from users where id = $1`, [ids.a]))[0].status === "SUSPENDED");
  r = await call(cookies.a, "GET", "/matches");
  check("and the rest of the app is closed to them (403)", r.status === 403);
  await pool.query(`update users set status = 'BANNED', "suspendedUntil" = null where id = $1`, [ids.a]);
  r = await call(cookies.a, "GET", "/safety");
  check("a banned person can still open the safety screen (BANNED)", r.status === 200 && r.body.status === "BANNED");
  await pool.query(`update users set status = 'DELETED' where id = $1`, [ids.a]);
  r = await call(cookies.a, "GET", "/safety");
  check("a deleted account is treated as signed out (401)", r.status === 401);
  await setStatus("ACTIVE");

  r = await call(cookies.a, "PUT", "/safety/incognito", { incognito: true });
  check("incognito turns on (200), stored on the profile", r.status === 200 && (await rows(`select incognito from profiles where "userId" = $1`, [ids.a]))[0].incognito === true);
  r = await call(cookies.a, "GET", "/safety");
  check("the screen reports incognito", r.body.incognito === true);
  await call(cookies.a, "PUT", "/safety/incognito", { incognito: false });

  // ---- hide-from
  r = await call(cookies.a, "POST", "/hides/course", { courseId: course.id });
  check("hiding a course hides everyone else in it (at least B and C)", r.status === 200 && r.body.count >= 2);
  const hiddenIds = (await rows(`select "hiddenUserId" from hide_rules where "userId" = $1`, [ids.a])).map((x) => x.hiddenUserId);
  check("the database holds one rule per person (B and C), none for A", hiddenIds.includes(ids.b) && hiddenIds.includes(ids.c) && !hiddenIds.includes(ids.a) && new Set(hiddenIds).size === hiddenIds.length);
  check("C leaves A's picks and A's pocket at once", !(await inPicks("a", "c")) && !(await inPocket("a", "c")));
  r = await call(cookies.a, "GET", "/safety");
  check("the safety screen lists them as hidden", r.body.hidden.some((x) => x.userId === ids.b) && r.body.hidden.some((x) => x.userId === ids.c));
  r = await call(cookies.a, "POST", "/hides/course", { courseId: course.id });
  check("hiding the same course again adds nothing (count 0)", r.status === 200 && r.body.count === 0);
  r = await call(cookies.a, "DELETE", `/hides/${ids.c}`);
  check("unhiding C works", r.status === 200 && r.body.status === "unhidden" && (await inPicks("a", "c")));
  await call(cookies.a, "DELETE", `/hides/${ids.b}`);
  r = await call(cookies.a, "DELETE", `/hides/${ids.b}`);
  check("unhiding someone not hidden is harmless (200)", r.status === 200);
  r = await call(cookies.a, "POST", "/hides/club", { clubId: club.id });
  check("hiding a club hides the other person in it (C)", r.status === 200 && r.body.count >= 1);
  await call(cookies.a, "DELETE", `/hides/${ids.c}`);
  r = await call(cookies.a, "POST", "/hides/email", { email: ` ${mail("c").toUpperCase()} ` });
  check("hiding by email works whatever its case or spacing", r.status === 200 && r.body.count === 1);
  await call(cookies.a, "DELETE", `/hides/${ids.c}`);
  r = await call(cookies.a, "POST", "/hides/email", { email: `nobody.${stamp}@test.ac.kr` });
  check("an email with no account is 404", r.status === 404);
  r = await call(cookies.a, "POST", "/hides/email", { email: mail("a") });
  check("hiding yourself is 422 CANNOT_HIDE_SELF", r.status === 422 && r.body.reason === "CANNOT_HIDE_SELF");
  r = await call(cookies.a, "POST", "/hides/email", { email: "not-an-email" });
  check("a malformed email is refused (400)", r.status === 400);

  // ---- report: hides at once, evidence only from your own chat
  const reportsBefore = (await rows(`select count(*)::int as n from reports where "reporterId" = $1`, [ids.a]))[0].n;
  const reportBody = { targetUserId: ids.c, category: "HARASSMENT", description: "kept messaging me" };
  r = await call(cookies.a, "POST", "/reports", reportBody);
  check("reporting without an Idempotency-Key is refused (400)", r.status === 400 && r.body.fields?.[0]?.name === "Idempotency-Key");
  r = await call(cookies.a, "POST", "/reports", { ...reportBody, category: "RUDE" }, { "idempotency-key": randomUUID() });
  check("a category that is not on the list is refused (400)", r.status === 400);
  r = await call(cookies.a, "POST", "/reports", { ...reportBody, targetUserId: ids.a }, { "idempotency-key": randomUUID() });
  check("reporting yourself is 422 CANNOT_REPORT_SELF", r.status === 422 && r.body.reason === "CANNOT_REPORT_SELF");
  r = await call(cookies.a, "POST", "/reports", { ...reportBody, targetUserId: randomUUID() }, { "idempotency-key": randomUUID() });
  check("reporting a person who does not exist is 404", r.status === 404);
  check("C is still visible before the report", (await inPicks("a", "c")) && (await inPocket("a", "c")));
  const keyR = randomUUID();
  r = await call(cookies.a, "POST", "/reports", reportBody, { "idempotency-key": keyR });
  check("the report is filed (200) and says the person is hidden", r.status === 200 && r.body.status === "filed" && r.body.hidden === true);
  const report = (await rows(`select id, status, priority, category, description, "conversationId", evidence from reports where "reporterId" = $1 and "targetId" = $2`, [ids.a, ids.c]))[0];
  check("the database holds one OPEN report with its category and description", report?.status === "OPEN" && report.category === "HARASSMENT" && report.description === "kept messaging me" && report.conversationId === null);
  check("and a hide rule from the reporter to the person", (await rows(`select 1 from hide_rules where "userId" = $1 and "hiddenUserId" = $2`, [ids.a, ids.c])).length === 1);
  check("the person is gone from the reporter's picks and pocket immediately", !(await inPicks("a", "c")) && !(await inPocket("a", "c")));
  check("while the reported person's own view is unchanged (they are not told)", await inPocket("c", "b"));
  r = await call(cookies.a, "POST", "/reports", reportBody, { "idempotency-key": keyR });
  check("a retry with the same key replays and files nothing twice", r.headers.get("idempotent-replay") === "true" && (await rows(`select count(*)::int as n from reports where "reporterId" = $1`, [ids.a]))[0].n === reportsBefore + 1);

  const keyMsg = randomUUID();
  await call(cookies.b, "POST", `/chat/${conversationId}/messages`, { text: "hey there" }, { "idempotency-key": keyMsg });
  await call(cookies.a, "POST", `/chat/${conversationId}/messages`, { text: "please stop" }, { "idempotency-key": randomUUID() });
  r = await call(cookies.a, "POST", "/reports", { targetUserId: ids.b, category: "UNWANTED_CONTACT", conversationId }, { "idempotency-key": randomUUID() });
  check("a report from the chat is filed (200)", r.status === 200);
  const chatReport = (await rows(`select evidence, "conversationId" from reports where "reporterId" = $1 and "targetId" = $2`, [ids.a, ids.b]))[0];
  check("the last messages are attached as evidence", chatReport?.conversationId === conversationId && Array.isArray(chatReport.evidence) && chatReport.evidence.map((m) => m.text).join("|") === "hey there|please stop");
  r = await call(cookies.a, "POST", "/reports", { targetUserId: ids.b, category: "SPAM", conversationId: randomUUID() }, { "idempotency-key": randomUUID() });
  check("evidence from a conversation that is not yours is refused (422 INVALID_CONVERSATION)", r.status === 422 && r.body.reason === "INVALID_CONVERSATION");
  r = await call(cookies.a, "POST", "/reports", { targetUserId: ids.c, category: "SPAM", conversationId }, { "idempotency-key": randomUUID() });
  check("and so is a conversation with someone other than the person reported", r.status === 422 && r.body.reason === "INVALID_CONVERSATION");
  r = await call(cookies.c, "POST", "/reports", { targetUserId: ids.b, category: "SPAM", conversationId }, { "idempotency-key": randomUUID() });
  check("an outsider cannot attach someone else's chat (422)", r.status === 422 && r.body.reason === "INVALID_CONVERSATION");

  // ---- block
  r = await call(cookies.a, "POST", "/blocks", { targetUserId: ids.a });
  check("blocking yourself is 422 CANNOT_BLOCK_SELF", r.status === 422 && r.body.reason === "CANNOT_BLOCK_SELF");
  r = await call(cookies.a, "POST", "/blocks", { targetUserId: randomUUID() });
  check("blocking a person who does not exist is 404, not a server error", r.status === 404);
  r = await call(cookies.a, "POST", "/blocks", { targetUserId: ids.b, reason: "x".repeat(501) });
  check("an over-long reason is refused (400)", r.status === 400);
  check("before blocking, A and B are matched and can chat", (await call(cookies.a, "GET", "/matches")).body.matches.some((m) => m.otherUserId === ids.b) && (await call(cookies.b, "GET", `/chat/${conversationId}`)).status === 200);
  r = await call(cookies.a, "POST", "/blocks", { targetUserId: ids.b, reason: "not for me" });
  check("blocking B works (200)", r.status === 200 && r.body.status === "blocked");
  check("the database holds the block with its reason", (await rows(`select reason from blocks where "blockerId" = $1 and "blockedId" = $2`, [ids.a, ids.b]))[0]?.reason === "not for me");
  check("the match disappears from both lists, and the chat is 404 to both", !(await call(cookies.a, "GET", "/matches")).body.matches.some((m) => m.otherUserId === ids.b) && !(await call(cookies.b, "GET", "/matches")).body.matches.some((m) => m.otherUserId === ids.a) && (await call(cookies.a, "GET", `/chat/${conversationId}`)).status === 404 && (await call(cookies.b, "GET", `/chat/${conversationId}`)).status === 404);
  r = await call(cookies.b, "POST", `/chat/${conversationId}/messages`, { text: "hello?" }, { "idempotency-key": randomUUID() });
  check("the blocked person cannot send (404)", r.status === 404);
  r = await call(cookies.a, "POST", "/blocks", { targetUserId: ids.b });
  check("blocking again changes nothing (still one block)", r.status === 200 && (await rows(`select 1 from blocks where "blockerId" = $1 and "blockedId" = $2`, [ids.a, ids.b])).length === 1);
  r = await call(cookies.a, "GET", "/safety");
  check("the safety screen lists B as blocked", r.body.blocked.some((x) => x.userId === ids.b));
  r = await call(cookies.b, "DELETE", `/blocks/${ids.a}`);
  check("the blocked person cannot remove the block (it is not theirs to undo)", r.status === 200 && (await rows(`select 1 from blocks where "blockerId" = $1 and "blockedId" = $2`, [ids.a, ids.b])).length === 1);
  r = await call(cookies.a, "DELETE", `/blocks/${ids.b}`);
  check("unblocking works, and the match and chat come back", r.status === 200 && r.body.status === "unblocked" && (await call(cookies.a, "GET", "/matches")).body.matches.some((m) => m.otherUserId === ids.b) && (await call(cookies.b, "GET", `/chat/${conversationId}`)).status === 200);

  // ---- appeals
  await call(cookies.c, "POST", "/reports", { targetUserId: ids.a, category: "SPAM" }, { "idempotency-key": randomUUID() });
  const reportOnA = (await rows(`select id from reports where "reporterId" = $1 and "targetId" = $2`, [ids.c, ids.a]))[0].id;
  const reportOnC = report.id;
  const mkAction = async (target, reportId, type) => {
    const id = randomUUID();
    await pool.query(`insert into moderation_actions (id, "reportId", "targetId", "actorId", type, reason) values ($1, $2, $3, $4, $5::"ModerationActionType", $6)`, [id, reportId, target, ids.b, type, `${type} reason`]);
    return id;
  };
  const warnA = await mkAction(ids.a, reportOnA, "WARN");
  const suspendA = await mkAction(ids.a, reportOnA, "SUSPEND");
  const warnC = await mkAction(ids.c, reportOnC, "WARN");
  r = await call(cookies.a, "GET", "/safety");
  check("the safety screen lists the actions on my account with their reasons, none appealed", r.body.actions.length === 2 && r.body.actions.every((a) => a.reason.endsWith("reason") && a.appealedAt === null) && !r.body.actions.some((a) => a.id === warnC));
  r = await call(cookies.a, "POST", "/safety/appeals", { moderationActionId: warnC, appealNote: "not mine" });
  check("appealing someone else's action is 404", r.status === 404);
  r = await call(cookies.a, "POST", "/safety/appeals", { moderationActionId: warnA, appealNote: "" });
  check("an empty appeal is refused (400)", r.status === 400);
  r = await call(cookies.a, "POST", "/safety/appeals", { moderationActionId: warnA, appealNote: "I did not do this" });
  check("appealing my own action works (200)", r.status === 200 && r.body.status === "submitted");
  const appealed = (await rows(`select "appealNote", "appealedAt" from moderation_actions where id = $1`, [warnA]))[0];
  check("the database holds the note and the time", appealed.appealNote === "I did not do this" && appealed.appealedAt !== null);
  r = await call(cookies.a, "POST", "/safety/appeals", { moderationActionId: warnA, appealNote: "again" });
  check("a second appeal on the same action is 422 ALREADY_APPEALED", r.status === 422 && r.body.reason === "ALREADY_APPEALED");
  await pool.query(`update users set status = 'SUSPENDED', "suspendedUntil" = ((now() at time zone 'utc') + interval '7 days') where id = $1`, [ids.a]);
  r = await call(cookies.a, "POST", "/safety/appeals", { moderationActionId: suspendA, appealNote: "please review" });
  check("a suspended person can appeal the suspension (200)", r.status === 200);
  await setStatus("ACTIVE");
  r = await call(cookies.a, "POST", "/safety/trust-appeals", { note: "please" });
  check("a trust appeal with no reach limit is 422 NOT_LIMITED", r.status === 422 && r.body.reason === "NOT_LIMITED");

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
