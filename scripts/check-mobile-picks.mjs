// Mobile daily-picks checks (BUILD_PLAN M06) against a running LOCAL stack: the website on localhost with a
// throwaway database that has the reference data imported (shared lists plus the sample campus) and the
// local-development storage folder. It creates fake users, fills their profiles through the mobile routes and edits
// a few rows directly (verified, shared course and club, a block), so it refuses to run against anything else.
//   source demo-work/e2e.env.sh && npm run dev   (SUPABASE_SECRET_KEY must be "" in that shell AND this one), then:
//   node scripts/check-mobile-picks.mjs
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
// Profile photos are uploaded, and .env.local holds the REAL storage address and key: see check-mobile-photos.mjs.
if (
  process.env.SUPABASE_SECRET_KEY !== "" ||
  /supabase.co/i.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")
) {
  console.error(
    'Refusing to run: set SUPABASE_SECRET_KEY="" (empty, not unset) and a non-Supabase NEXT_PUBLIC_SUPABASE_URL (for example http://localhost:54321) in the shell that starts the website AND this script.',
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

/** Every required profile step through the mobile routes, so these users are real, finished profiles. */
async function finishProfile(cookie, firstName, options, photo) {
  const { prompts, majorGroups } = options;
  const steps = [
    [
      "PUT",
      "/profile/basics",
      { firstName, gender: "WOMAN", year: 2, major: majorGroups[1].majors[0].ko, interestedIn: [] },
    ],
    ["PUT", "/profile/intents", { intents: ["FRIENDS"] }],
    [
      "PUT",
      "/profile/prompts",
      {
        promptIds: [prompts[0].id, prompts[1].id, prompts[2].id],
        answers: [`${firstName} one`, `${firstName} two`, `${firstName} three`],
      },
    ],
    ["PUT", "/profile/values", { answers: [3, 4, 3, 4, 3, 4, 3, 4] }],
  ];
  for (const [method, route, body] of steps) {
    const r = await call(cookie, method, route, body);
    if (r.status !== 200)
      throw new Error(`${route} failed for ${firstName}: ${r.status} ${JSON.stringify(r.body)}`);
  }
  for (let i = 0; i < 3; i++) {
    const r = await upload(cookie, photo);
    if (r.status !== 201) throw new Error(`photo ${i} failed for ${firstName}: ${r.status}`);
  }
  const done = await call(cookie, "POST", "/profile/finish");
  if (done.body.status !== "complete")
    throw new Error(`finish failed for ${firstName}: ${JSON.stringify(done.body)}`);
}

const stamp = Date.now();
const mail = (tag) => `m06.${tag}.${stamp}@test.ac.kr`;
/** Removes this run's fake users, so they do not crowd the next run's candidates out of a ranked, capped list. */
async function cleanup() {
  for (const tag of ["v", "c1", "c2", "c3", "u"]) {
    const email = mail(tag);
    const who = "(select id from users where email = $1)";
    await pool.query(`delete from consents where "userId" = ${who}`, [email]);
    await pool.query(
      `delete from referrals where "referrerId" = ${who} or "referredUserId" = ${who}`,
      [email],
    );
    await pool.query(`delete from audit_log where "actorId" = ${who}`, [email]);
    await pool.query(`delete from users where email = $1`, [email]);
  }
}

(async () => {
  const names = { v: "Vera", c1: "Cora", c2: "Dani", c3: "Elin" };
  const photo = fs.readFileSync(path.join(ROOT, "e2e/fixtures/photo-with-exif.jpg"));

  const cookies = {};
  for (const tag of ["v", "c1", "c2", "c3", "u"]) {
    cookies[tag] = await signUp(mail(tag));
    const r = await setup(cookies[tag]);
    if (r.status !== 200) throw new Error(`setup failed for ${tag}: ${r.status}`);
  }
  const options = (await call(cookies.v, "GET", "/profile/options")).body;
  for (const tag of ["v", "c1", "c2", "c3"])
    await finishProfile(cookies[tag], names[tag], options, photo);

  // Candidates must be verified, and a shared course and club is what makes them overlap.
  const ids = {};
  for (const tag of ["v", "c1", "c2", "c3", "u"]) {
    ids[tag] = (await pool.query(`select id from users where email = $1`, [mail(tag)])).rows[0].id;
  }
  await pool.query(`update users set "verifiedAt" = now() where id = any($1)`, [
    [ids.v, ids.c1, ids.c2, ids.c3],
  ]);
  const campusId = (await pool.query(`select "campusId" from users where id = $1`, [ids.v])).rows[0]
    .campusId;
  const courseId = (
    await pool.query(`select id from courses where "campusId" = $1 limit 1`, [campusId])
  ).rows[0].id;
  const clubId = (
    await pool.query(`select id from clubs where "campusId" = $1 limit 1`, [campusId])
  ).rows[0].id;
  for (const tag of ["v", "c1", "c2", "c3"]) {
    const profileId = (await pool.query(`select id from profiles where "userId" = $1`, [ids[tag]]))
      .rows[0].id;
    await pool.query(
      `insert into profile_courses (id, "profileId", "courseId") values ($1, $2, $3) on conflict do nothing`,
      [randomUUID(), profileId, courseId],
    );
    await pool.query(
      `insert into profile_clubs (id, "profileId", "clubId") values ($1, $2, $3) on conflict do nothing`,
      [randomUUID(), profileId, clubId],
    );
  }

  // ---- who may ask
  let r = await call(undefined, "GET", "/picks");
  check("no session is refused (401)", r.status === 401);
  r = await call(cookies.u, "GET", "/picks");
  check(
    "a person who has not finished their profile gets 422 PROFILE_INCOMPLETE",
    r.status === 422 && r.body.reason === "PROFILE_INCOMPLETE",
  );

  // ---- the list
  r = await call(cookies.v, "GET", "/picks");
  const friends = r.body.intents?.find((i) => i.intent === "FRIENDS");
  check(
    "the viewer gets a Friends list of picks",
    r.status === 200 && Array.isArray(friends?.items) && friends.items.length >= 1,
    `${friends?.items?.length} picks`,
  );
  const items = friends?.items ?? [];
  const candidateNames = new Set([names.c1, names.c2, names.c3]);
  // The local database is long-lived, so other finished and verified people from earlier runs may be listed too: what
  // matters is that the three people made for this run (who share a course and a club with the viewer) are there.
  check(
    "the three people made for this run, who overlap with the viewer, are among the picks",
    [...candidateNames].every((n) => items.some((i) => i.firstName === n)),
  );
  check(
    "the viewer is never one of their own picks",
    items.every((i) => i.firstName !== names.v),
  );
  check("at most six are shown", items.length <= 6);

  const expectedKeys = [
    "firstName",
    "id",
    "major",
    "photos",
    "prompts",
    "reasons",
    "secondChance",
    "year",
  ];
  check(
    "every card has exactly the documented fields",
    items.every((i) => JSON.stringify(Object.keys(i).sort()) === JSON.stringify(expectedKeys)),
  );
  check(
    "every card has photos with full addresses",
    items.every(
      (i) =>
        i.photos.length === 3 &&
        i.photos.every((p) =>
          /^http:\/\/localhost:3000\/api\/dev-storage\/profile-photos\//.test(p.url),
        ),
    ),
  );
  check(
    "every card has its three prompts with the question written in English",
    items.every((i) => i.prompts.length === 3 && i.prompts.every((p) => p.question && p.answer)),
  );
  const mine = items.filter((i) => candidateNames.has(i.firstName));
  // A course or club that most people share says little, so the engine may leave it out and keep, say, the values reason.
  check(
    "every card gives at least one reason, and any course, club or interest reason is named",
    items.every(
      (i) =>
        i.reasons.length >= 1 &&
        i.reasons.every((x) =>
          x.type === "course" || x.type === "club" || x.type === "interest"
            ? Boolean(x.label)
            : x.type === "values" ||
              (x.type === "freeTime" && Number.isInteger(x.day) && Number.isInteger(x.block)),
        ),
    ),
    JSON.stringify(mine[0]?.reasons),
  );

  // A photo's address contains its storage folder, which is its owner's id; the website's photo links do the same. That is
  // the one place an id can appear, so photo addresses are set aside and everything else must be free of them.
  const text = JSON.stringify(r.body, (key, value) => (key === "url" ? "(photo address)" : value));
  const forbidden = [
    ...["c1", "c2", "c3"].map((t) => ids[t]),
    ...["c1", "c2", "c3"].map(mail),
    "interestedIn",
    "birthYear",
    "gender",
    "candidateUserId",
    "userId",
    "email",
  ];
  const leaked = forbidden.filter((f) => text.includes(f));
  check(
    "no card carries another person's user id, email, birth year, gender or preference",
    leaked.length === 0,
    leaked.join(", "),
  );

  const firstPhoto = items[0]?.photos[0]?.url;
  const withCookie = await fetch(firstPhoto, { headers: { cookie: cookies.v } });
  const withoutCookie = await fetch(firstPhoto);
  check(
    "a photo address loads for the signed-in person (200 image) and not for a stranger (401)",
    withCookie.status === 200 &&
      (withCookie.headers.get("content-type") || "").startsWith("image/") &&
      withoutCookie.status === 401,
  );

  const dbIds = (
    await pool.query(
      `select bi.id from batch_items bi join daily_batches db on db.id = bi."dailyBatchId"
      where db."userId" = $1 and db.intent = 'FRIENDS' and bi.decision is null order by bi.rank`,
      [ids.v],
    )
  ).rows.map((x) => x.id);
  check(
    "the list is the website's own batch: the same picks in the same order as the database holds",
    JSON.stringify(items.map((i) => i.id)) === JSON.stringify(dbIds),
    `${dbIds.length} rows`,
  );

  const ko = await call(cookies.v, "GET", "/picks?locale=ko");
  check(
    "?locale=ko is accepted and returns the same picks",
    ko.status === 200 &&
      ko.body.intents.find((i) => i.intent === "FRIENDS").items.length === items.length,
  );
  check(
    "an unknown language is refused (400)",
    (await call(cookies.v, "GET", "/picks?locale=fr")).status === 400,
  );

  // ---- pass
  const target = mine[0];
  const keyA = randomUUID();
  r = await call(cookies.v, "POST", `/picks/${target.id}/pass`, {});
  check(
    "passing without an Idempotency-Key is refused (400)",
    r.status === 400 && r.body.fields?.[0]?.name === "Idempotency-Key",
  );
  r = await call(cookies.v, "POST", `/picks/${target.id}/pass`, {}, { "idempotency-key": keyA });
  check(
    "passing a pick works (200 passed)",
    r.status === 200 && r.body.status === "passed" && r.body.batchItemId === target.id,
  );
  const decided = (await pool.query(`select decision from batch_items where id = $1`, [target.id]))
    .rows[0];
  check("and the database records it as PASSED", decided.decision === "PASSED");
  r = await call(cookies.v, "POST", `/picks/${target.id}/pass`, {}, { "idempotency-key": keyA });
  check(
    "a retry with the same key replays the first answer",
    r.status === 200 && r.headers.get("idempotent-replay") === "true",
  );
  r = await call(
    cookies.v,
    "POST",
    `/picks/${target.id}/pass`,
    {},
    { "idempotency-key": randomUUID() },
  );
  check(
    "passing the same pick again with a new key is 422 ALREADY_DECIDED",
    r.status === 422 && r.body.reason === "ALREADY_DECIDED",
  );

  r = await call(cookies.v, "GET", "/picks");
  const after = r.body.intents.find((i) => i.intent === "FRIENDS").items;
  check(
    "a passed person is not listed again",
    !after.some((i) => i.id === target.id) && after.length === items.length - 1,
    `${after.length} left`,
  );
  const afterNames = after.map((i) => i.firstName);
  check(
    "and nobody else disappeared",
    afterNames.every((n) => items.some((i) => i.firstName === n)),
  );

  // ---- somebody else's pick
  const other = after.find((i) => i.id !== target.id);
  r = await call(
    cookies.c1,
    "POST",
    `/picks/${other.id}/pass`,
    {},
    { "idempotency-key": randomUUID() },
  );
  check(
    "someone else cannot pass your pick: 404, exactly like one that does not exist",
    r.status === 404 && r.body.error === "NOT_FOUND",
  );
  const untouched = (await pool.query(`select decision from batch_items where id = $1`, [other.id]))
    .rows[0];
  check("and your pick is untouched", untouched.decision === null);
  r = await call(
    cookies.v,
    "POST",
    `/picks/${randomUUID()}/pass`,
    {},
    { "idempotency-key": randomUUID() },
  );
  check("a pick that does not exist is 404", r.status === 404);
  r = await call(
    cookies.v,
    "POST",
    `/picks/..%2F..%2Fx/pass`,
    {},
    { "idempotency-key": randomUUID() },
  );
  check("an id with odd characters is 404, not an error", r.status === 404);

  // ---- a block made after today's batch was composed hides that person at once
  const blockedCard =
    after.find((i) => candidateNames.has(i.firstName) && i.id !== other.id) ?? other;
  const blockedTag = ["c1", "c2", "c3"].find((t) => names[t] === blockedCard.firstName);
  if (!blockedTag) throw new Error("the blocked card is not one of this run's people");
  await pool.query(`insert into blocks (id, "blockerId", "blockedId") values ($1, $2, $3)`, [
    randomUUID(),
    ids.v,
    ids[blockedTag],
  ]);
  r = await call(cookies.v, "GET", "/picks");
  const afterBlock = r.body.intents.find((i) => i.intent === "FRIENDS").items;
  check(
    "a person blocked after the batch was made is no longer listed",
    !afterBlock.some((i) => i.firstName === blockedCard.firstName),
    `${afterBlock.length} left`,
  );

  // ---- caught up
  for (const card of afterBlock) {
    await call(
      cookies.v,
      "POST",
      `/picks/${card.id}/pass`,
      {},
      { "idempotency-key": randomUUID() },
    );
  }
  r = await call(cookies.v, "GET", "/picks");
  const caughtUp = r.body.intents.find((i) => i.intent === "FRIENDS");
  check(
    "once every pick is decided the mode is listed with no items (the caught-up state)",
    r.status === 200 && caughtUp && caughtUp.items.length === 0,
  );

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
