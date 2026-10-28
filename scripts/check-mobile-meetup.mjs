// Mobile meetup planner checks (BUILD_PLAN M10) against a running LOCAL stack: the website on
// localhost with a throwaway database that has the reference data imported (shared lists plus the
// sample campus) and the local-development storage folder. Mirrors scripts/check-mobile-chat.mjs's setup.
//   export DATABASE_URL=... DIRECT_URL=... (both localhost) && npm run dev, then:
//   node scripts/check-mobile-meetup.mjs
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
const mail = (tag) => `m10.${tag}.${stamp}@test.ac.kr`;
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
  const names = { a: "Ines", b: "Joon", c: "Kai" };
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
  for (const tag of ["a", "b", "c"]) ids[tag] = (await pool.query(`select id from users where email = $1`, [mail(tag)])).rows[0].id;
  await pool.query(`update users set "verifiedAt" = now() where id = any($1)`, [[ids.a, ids.b, ids.c]]);
  const campusId = (await pool.query(`select "campusId" from users where id = $1`, [ids.a])).rows[0].campusId;
  const courseId = (await pool.query(`select id from courses where "campusId" = $1 limit 1`, [campusId])).rows[0].id;
  for (const tag of ["a", "b"]) {
    const profileId = (await pool.query(`select id from profiles where "userId" = $1`, [ids[tag]])).rows[0].id;
    await pool.query(`insert into profile_courses (id, "profileId", "courseId") values ($1, $2, $3) on conflict do nothing`, [randomUUID(), profileId, courseId]);
  }
  // A and B are both free every day from 12:00 to 16:00 (slot = day * 12 + block, blocks 6 and 7).
  const everyDay = [0, 1, 2, 3, 4, 5, 6].flatMap((d) => [d * 12 + 6, d * 12 + 7]);
  await pool.query(`update profiles set "freeTimeSlots" = $1::int[] where "userId" = any($2)`, [everyDay, [ids.a, ids.b]]);

  await waveThenMatch(cookies.a, cookies.b, ids.a, ids.b, names.a, names.b, "same class!");
  const matchId = (await pool.query(`select id from matches where ("userAId" = $1 and "userBId" = $2) or ("userAId" = $2 and "userBId" = $1)`, [ids.a, ids.b])).rows[0].id;
  const rows = async (sql, params) => (await pool.query(sql, params)).rows;

  // ---- who may ask
  let r = await call(undefined, "GET", `/meetup/${matchId}`);
  check("no session is refused (401)", r.status === 401);
  r = await call(cookies.c, "GET", `/meetup/${matchId}`);
  check("a match that is not the caller's is 404, not 403", r.status === 404);
  r = await call(cookies.a, "GET", `/meetup/${randomUUID()}`);
  check("a match that does not exist is 404", r.status === 404);

  // ---- the planner before anything is proposed
  r = await call(cookies.a, "GET", `/meetup/${matchId}`);
  const screenA = r.body;
  check("the planner opens (200) with no live proposal", r.status === 200 && screenA.proposal === null);
  check("it names the other person", screenA.other.firstName === names.b);
  check("it suggests three times at Safe Spots from the shared free time", screenA.options.length === 3 && screenA.options.every((o) => o.spotId && [6, 7].includes(o.block)));
  check("it lists the campus Safe Spots, and 14 selectable days with daytime blocks", screenA.safeSpots.length > 0 && screenA.customDays.length === 14 && screenA.customBlocks.join() === "4,5,6,7,8,9,10");
  const byKey = Object.fromEntries(screenA.emergencyContacts.map((c) => [c.key, c]));
  check("the emergency numbers are 112, 119 and 1366", byKey.police?.phone === "112" && byKey.ambulance?.phone === "119" && byKey.womenHotline?.phone === "1366");
  check("a number that is not verified yet is null with a note, never invented", byKey.digitalSexCrime?.phone === null && Boolean(byKey.digitalSexCrime?.noteEn));
  check("the screen never carries either person's email", !JSON.stringify(screenA).includes(mail("a")) && !JSON.stringify(screenA).includes(mail("b")));

  // ---- proposing a suggested time
  const opt = screenA.options[0];
  const proposeBody = { spotId: opt.spotId, day: opt.day, block: opt.block };
  r = await call(cookies.a, "POST", `/meetup/${matchId}/propose`, proposeBody);
  check("proposing without an Idempotency-Key is refused (400)", r.status === 400 && r.body.fields?.[0]?.name === "Idempotency-Key");
  r = await call(cookies.a, "POST", `/meetup/${matchId}/propose`, { ...proposeBody, block: 0, day: 0 }, { "idempotency-key": randomUUID() });
  check("a time that is not one of the server's suggestions is 422 INVALID_OPTION", r.status === 422 && r.body.reason === "INVALID_OPTION");
  r = await call(cookies.a, "POST", `/meetup/${matchId}/propose`, { ...proposeBody, extra: 1 }, { "idempotency-key": randomUUID() });
  check("an unexpected body field is refused (400)", r.status === 400);
  const keyP = randomUUID();
  r = await call(cookies.a, "POST", `/meetup/${matchId}/propose`, proposeBody, { "idempotency-key": keyP });
  check("proposing a suggested time works (200)", r.status === 200 && r.body.status === "proposed");
  r = await call(cookies.a, "POST", `/meetup/${matchId}/propose`, proposeBody, { "idempotency-key": keyP });
  check("a retry with the same key replays the first answer", r.status === 200 && r.headers.get("idempotent-replay") === "true");
  const proposals = await rows(`select id, status, "proposedByUserId", to_char("scheduledStart", 'YYYY-MM-DD"T"HH24:MI:SS".000Z"') as start from meet_proposals where "matchId" = $1`, [matchId]);
  check(
    "the database holds exactly one PROPOSED row, with the server's own start time",
    proposals.length === 1 && proposals[0].status === "PROPOSED" && proposals[0].proposedByUserId === ids.a && proposals[0].start === opt.start,
  );
  const proposalId = proposals[0].id;
  r = await call(cookies.a, "POST", `/meetup/${matchId}/propose`, proposeBody, { "idempotency-key": randomUUID() });
  check("a second proposal while one is waiting is 422 ALREADY_PLANNED", r.status === 422 && r.body.reason === "ALREADY_PLANNED");

  // ---- the other person's view
  r = await call(cookies.b, "GET", `/meetup/${matchId}`);
  check(
    "B sees A's proposal as PROPOSED, proposed by A, with no options to pick from",
    r.body.proposal?.status === "PROPOSED" && r.body.proposal.proposedByUserId === ids.a && r.body.options.length === 0 && r.body.safeSpots.length === 0,
  );
  r = await call(cookies.a, "POST", `/meetup/proposals/${proposalId}/respond`, { decision: "ACCEPT" });
  check("A cannot accept their own proposal (422 CANNOT_ACCEPT_OWN)", r.status === 422 && r.body.reason === "CANNOT_ACCEPT_OWN");
  r = await call(cookies.c, "POST", `/meetup/proposals/${proposalId}/respond`, { decision: "ACCEPT" });
  check("someone outside the match gets 404 on respond", r.status === 404);
  r = await call(cookies.b, "POST", `/meetup/proposals/${proposalId}/respond`, { decision: "MAYBE" });
  check("a decision that is not ACCEPT or DECLINE is refused (400)", r.status === 400);
  r = await call(cookies.b, "POST", `/meetup/proposals/${proposalId}/cancel`);
  check("a waiting proposal cannot be cancelled (422 NOT_ACCEPTED)", r.status === 422 && r.body.reason === "NOT_ACCEPTED");
  r = await call(cookies.b, "POST", `/meetup/proposals/${proposalId}/respond`, { decision: "ACCEPT" });
  check("B accepting works (200 accepted)", r.status === 200 && r.body.status === "accepted");
  check("the database records ACCEPTED by B", (await rows(`select status, "respondedByUserId" from meet_proposals where id = $1`, [proposalId]))[0].status === "ACCEPTED");
  r = await call(cookies.b, "POST", `/meetup/proposals/${proposalId}/respond`, { decision: "ACCEPT" });
  check("answering twice is 422 NOT_PENDING", r.status === 422 && r.body.reason === "NOT_PENDING");

  // ---- share link
  r = await call(cookies.a, "POST", `/meetup/proposals/${proposalId}/share-link`, {});
  check("a share link without an Idempotency-Key is refused (400)", r.status === 400);
  r = await call(cookies.c, "POST", `/meetup/proposals/${proposalId}/share-link`, {}, { "idempotency-key": randomUUID() });
  check("someone outside the match cannot make a share link (404)", r.status === 404);
  const keyL = randomUUID();
  r = await call(cookies.a, "POST", `/meetup/proposals/${proposalId}/share-link`, {}, { "idempotency-key": keyL });
  const link = r.body;
  check("a share link is created (200) with a full address", r.status === 200 && link.status === "created" && /\/plan\/[A-Za-z0-9_-]{20,}$/.test(link.url));
  r = await call(cookies.a, "POST", `/meetup/proposals/${proposalId}/share-link`, {}, { "idempotency-key": keyL });
  check(
    "a retry with the same key gives back the same link, not a second one",
    r.headers.get("idempotent-replay") === "true" && r.body.url === link.url && (await rows(`select 1 from plan_share_links where "proposalId" = $1`, [proposalId])).length === 1,
  );
  const linkRow = (await rows(`select "expiresAt" from plan_share_links where "proposalId" = $1`, [proposalId]))[0];
  const endMs = new Date((await rows(`select "scheduledEnd" from meet_proposals where id = $1`, [proposalId]))[0].scheduledEnd).getTime();
  check("it expires six hours after the meetup ends", new Date(linkRow.expiresAt).getTime() === endMs + 6 * 60 * 60 * 1000);
  const planPage = await fetch(link.url.replace(/^https?:\/\/[^/]+/, BASE));
  check("the public plan page opens for the link (200)", planPage.status === 200);
  r = await call(cookies.a, "GET", `/meetup/${matchId}`);
  check("the planner lists the link as a full address, without a raw token field", r.body.proposal.shareLinks.length === 1 && r.body.proposal.shareLinks[0].url === link.url && !JSON.stringify(r.body).includes('"token"'));

  // ---- check-in: private, never files a report
  const reportsBefore = (await rows(`select count(*)::int as n from reports`))[0].n;
  r = await call(cookies.a, "POST", `/meetup/proposals/${proposalId}/feedback`, { response: "AMAZING" });
  check("an answer that is not on the list is refused (400)", r.status === 400);
  r = await call(cookies.a, "POST", `/meetup/proposals/${proposalId}/feedback`, { response: "UNCOMFORTABLE" });
  check("an UNCOMFORTABLE check-in is saved (200)", r.status === 200 && r.body.status === "saved");
  const reportsAfter = (await rows(`select count(*)::int as n from reports`))[0].n;
  check("it never files a report by itself", reportsAfter === reportsBefore);
  r = await call(cookies.a, "POST", `/meetup/proposals/${proposalId}/feedback`, { response: "GREAT" });
  const fb = await rows(`select response from meetup_feedback_entries where "proposalId" = $1 and "userId" = $2`, [proposalId, ids.a]);
  check("answering again replaces the earlier answer (one row, GREAT)", r.status === 200 && fb.length === 1 && fb[0].response === "GREAT");
  r = await call(cookies.a, "GET", `/meetup/${matchId}`);
  check("the planner reports my own answer back", r.body.proposal.myFeedbackResponse === "GREAT");
  r = await call(cookies.b, "GET", `/meetup/${matchId}`);
  check("B's answer is separate: still none", r.body.proposal.myFeedbackResponse === null);

  // ---- cancel, then suggest your own time
  r = await call(cookies.b, "POST", `/meetup/proposals/${proposalId}/cancel`);
  check("B can cancel a confirmed meetup (200 cancelled)", r.status === 200 && r.body.status === "cancelled");
  r = await call(cookies.a, "POST", `/meetup/proposals/${proposalId}/share-link`, {}, { "idempotency-key": randomUUID() });
  check("a share link on a cancelled meetup is 422 NOT_ACCEPTED", r.status === 422 && r.body.reason === "NOT_ACCEPTED");
  r = await call(cookies.a, "GET", `/meetup/${matchId}`);
  check("after cancelling, the planner offers options again", r.body.proposal === null && r.body.options.length === 3);

  const spot = screenA.safeSpots[0];
  r = await call(cookies.a, "POST", `/meetup/${matchId}/propose-custom`, { spotId: spot.id, dayOffset: 3, block: 99 }, { "idempotency-key": randomUUID() });
  check("a custom block outside 0-11 is refused (400)", r.status === 400);
  r = await call(cookies.a, "POST", `/meetup/${matchId}/propose-custom`, { spotId: spot.id, dayOffset: 3, block: 1 }, { "idempotency-key": randomUUID() });
  check("a night-time custom block is 422 INVALID_OPTION", r.status === 422 && r.body.reason === "INVALID_OPTION");
  r = await call(cookies.a, "POST", `/meetup/${matchId}/propose-custom`, { spotId: spot.id, dayOffset: 14, block: 6 }, { "idempotency-key": randomUUID() });
  check("a day past the 14-day range is 422 INVALID_OPTION", r.status === 422 && r.body.reason === "INVALID_OPTION");
  r = await call(cookies.a, "POST", `/meetup/${matchId}/propose-custom`, { spotId: randomUUID(), dayOffset: 3, block: 6 }, { "idempotency-key": randomUUID() });
  check("a place that is not a Safe Spot on the campus is 422 INVALID_OPTION", r.status === 422 && r.body.reason === "INVALID_OPTION");
  r = await call(cookies.a, "POST", `/meetup/${matchId}/propose-custom`, { spotId: spot.id, dayOffset: 3, block: 6 }, { "idempotency-key": randomUUID() });
  check("a custom time at a Safe Spot works (200)", r.status === 200 && r.body.status === "proposed");
  r = await call(cookies.b, "GET", `/meetup/${matchId}`);
  const custom = r.body.proposal;
  check("B sees the custom proposal at that spot", custom?.status === "PROPOSED" && custom.proposedByUserId === ids.a && custom.spotName === spot.name);
  r = await call(cookies.b, "POST", `/meetup/proposals/${custom.proposalId}/respond`, { decision: "DECLINE" });
  check("B declining works (200 declined)", r.status === 200 && r.body.status === "declined");
  r = await call(cookies.a, "GET", `/meetup/${matchId}`);
  check("after a decline there is no live proposal, so A can suggest again", r.body.proposal === null && r.body.options.length === 3);

  // ---- an ended match
  r = await call(cookies.b, "POST", `/matches/${matchId}/unmatch`);
  r = await call(cookies.a, "POST", `/meetup/${matchId}/propose`, proposeBody, { "idempotency-key": randomUUID() });
  check("proposing on an unmatched pair is 422 UNMATCHED", r.status === 422 && r.body.reason === "UNMATCHED");
  r = await call(cookies.a, "GET", `/meetup/${matchId}`);
  check("the planner of an unmatched pair is 404", r.status === 404);

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
