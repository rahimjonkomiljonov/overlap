// Mobile profile checks (BUILD_PLAN M05) against a running LOCAL stack: the website on localhost with a
// throwaway database that has the reference data imported (shared lists plus the sample campus). It
// creates fake users and a second campus, so it refuses to run against anything else.
//   npm run dev   (with the throwaway database's env), then:   node scripts/check-mobile-profile.mjs
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.CHECK_BASE_URL || "http://localhost:3000";
const DATABASE_URL = process.env.DATABASE_URL || "";
const OUTBOX = path.join(here, "..", ".dev-outbox.jsonl");
if (!BASE.startsWith("http://localhost") || !/@(localhost|127\.0\.0\.1)[:/]/.test(DATABASE_URL)) {
  console.error(
    "Refusing to run: this script needs a localhost website (CHECK_BASE_URL) and a localhost DATABASE_URL.",
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
const call = async (cookie, method, route, body) => {
  const res = await fetch(`${BASE}/api/mobile/v1${route}`, {
    method,
    headers: {
      "x-app-version": "0.1.0",
      cookie,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const setup = (cookie, sensitivePreference) =>
  call(cookie, "POST", "/onboarding/account", {
    birthYear: 2000,
    birthMonth: 5,
    birthDay: 17,
    attestedAdult: true,
    termsAccepted: true,
    sensitivePreference,
  });

(async () => {
  const stamp = Date.now();
  const emailA = `m05.a.${stamp}@test.ac.kr`;
  const emailB = `m05.b.${stamp}@test.ac.kr`;
  const cookieA = await signUp(emailA);
  const cookieB = await signUp(emailB);

  // A second campus with its own course, club and spot: nobody on test.ac.kr may ever pick them.
  const otherCampus = randomUUID();
  const otherCourse = randomUUID();
  const otherClub = randomUUID();
  await pool.query(`insert into campuses (id, name, "updatedAt") values ($1, $2, now())`, [
    otherCampus,
    `m05-other-${stamp}`,
  ]);
  await pool.query(
    `insert into courses (id, "campusId", term, code, title, "searchText", "updatedAt") values ($1, $2, '2026-2', 'ZZ999', 'Other campus course', 'zz999 other campus course', now())`,
    [otherCourse, otherCampus],
  );
  await pool.query(
    `insert into clubs (id, "campusId", name, "searchText", "updatedAt") values ($1, $2, 'Other campus club', 'other campus club', now())`,
    [otherClub, otherCampus],
  );

  // Before account setup, nothing about the profile is reachable.
  let r = await call(cookieA, "GET", "/profile");
  check(
    "before account setup, /profile is refused (403 ACCOUNT_SETUP_REQUIRED)",
    r.status === 403 && r.body.error === "ACCOUNT_SETUP_REQUIRED",
  );
  r = await call(cookieA, "PUT", "/profile/basics", { firstName: "A" });
  check("and so is saving a step", r.status === 403);

  // A declines the sensitive consent, B grants it.
  r = await setup(cookieA, false);
  check(
    "account setup completes (A declines the Dating consent)",
    r.status === 200 && r.body.status === "complete",
  );
  r = await setup(cookieB, true);
  check("account setup completes (B grants it)", r.status === 200 && r.body.status === "complete");

  r = await call(cookieA, "GET", "/profile");
  check(
    "a fresh profile starts empty, with everything required listed as missing",
    r.status === 200 &&
      r.body.firstName === "" &&
      ["basics", "intents", "valuesQuiz", "prompts", "photos"].every((m) =>
        r.body.missing.includes(m),
      ),
    `missing: ${r.body.missing}`,
  );
  check("and Dating is reported as needing consent for A", r.body.datingStatus === "needs_consent");

  r = await call(cookieA, "GET", "/profile/options");
  check(
    "the options carry the lists and limits",
    r.status === 200 &&
      r.body.limits.minPhotos === 3 &&
      r.body.prompts.length >= 3 &&
      r.body.interests.length >= 5 &&
      r.body.majorGroups.length > 3,
    `prompts ${r.body.prompts?.length}, interests ${r.body.interests?.length}`,
  );
  const { prompts, interests, majorGroups } = r.body;
  const major = majorGroups[1].majors[0].ko;

  // Search sees only the caller's own campus
  r = await call(cookieA, "GET", "/reference/search?type=course&q=");
  const courses = r.body.results;
  check(
    "course search returns the person's own campus",
    r.status === 200 && courses.length > 0 && !courses.some((c) => c.id === otherCourse),
    `${courses?.length} courses`,
  );
  r = await call(cookieA, "GET", "/reference/search?type=course&q=zz999");
  check(
    "and never finds the other campus's course, even by exact code",
    r.status === 200 && r.body.results.length === 0,
  );
  r = await call(cookieA, "GET", "/reference/search?type=club&q=");
  const clubs = r.body.results;
  check("club search likewise", clubs.length > 0 && !clubs.some((c) => c.id === otherClub));
  r = await call(cookieA, "GET", "/reference/search?type=pet&q=a");
  check("an unknown search type is refused", r.status === 400);

  // Saving steps as A (consent declined)
  r = await call(cookieA, "PUT", "/profile/basics", {
    firstName: "Jisoo",
    gender: "WOMAN",
    pronouns: "she/her",
    year: 2,
    major,
    interestedIn: ["MAN"],
  });
  check("basics saves", r.status === 200 && r.body.status === "saved");
  let row = (
    await pool.query(
      `select "interestedIn", "onboardingStep" from profiles where "userId" = (select id from users where email = $1)`,
      [emailA],
    )
  ).rows[0];
  check(
    "A declined the sensitive consent, so 'who I'd like to meet' was NOT stored even though it was sent",
    row.interestedIn === null,
  );

  r = await call(cookieA, "PUT", "/profile/basics", {
    firstName: "Jisoo",
    gender: "WOMAN",
    year: 2,
    major: "Made-up Department",
    interestedIn: [],
  });
  check("an unknown department is refused", r.status === 400);
  r = await call(cookieA, "PUT", "/profile/basics", {
    firstName: "Jisoo",
    gender: "WOMAN",
    year: 2,
    major,
    interestedIn: [],
    isAdmin: true,
  });
  check("an unexpected field is refused, not ignored", r.status === 400);

  r = await call(cookieA, "PUT", "/profile/intents", { intents: ["FRIENDS", "DATING"] });
  check(
    "Dating is refused without the consent (422 DATING_REQUIRES_CONSENT)",
    r.status === 422 && r.body.reason === "DATING_REQUIRES_CONSENT",
  );
  r = await call(cookieA, "PUT", "/profile/intents", { intents: ["FRIENDS", "STUDY"] });
  check("Friends and Study save fine", r.status === 200);

  r = await call(cookieA, "PUT", "/profile/courses", {
    courseIds: [courses[0].id, otherCourse, randomUUID()],
  });
  check("courses save", r.status === 200);
  const saved = (
    await pool.query(
      `select "courseId" from profile_courses where "profileId" = (select id from profiles where "userId" = (select id from users where email = $1))`,
      [emailA],
    )
  ).rows.map((x) => x.courseId);
  check(
    "only the person's own campus's course was kept; the other campus's and a made-up id were dropped",
    saved.length === 1 && saved[0] === courses[0].id,
  );

  r = await call(cookieA, "PUT", "/profile/clubs", { clubIds: [clubs[0].id, otherClub] });
  const savedClubs = (
    await pool.query(
      `select "clubId" from profile_clubs where "profileId" = (select id from profiles where "userId" = (select id from users where email = $1))`,
      [emailA],
    )
  ).rows.map((x) => x.clubId);
  check(
    "clubs: same rule",
    r.status === 200 && savedClubs.length === 1 && savedClubs[0] === clubs[0].id,
  );

  r = await call(cookieA, "PUT", "/profile/free-time", { slots: [30, 2, 30, 14] });
  check("free time saves", r.status === 200);
  r = await call(cookieA, "PUT", "/profile/free-time", { slots: [84] });
  check("a slot outside the week is refused", r.status === 400);

  r = await call(cookieA, "PUT", "/profile/interests", {
    interestTagIds: interests.slice(0, 3).map((i) => i.id),
    freeText: ["origami"],
  });
  check("interests save", r.status === 200);
  r = await call(cookieA, "PUT", "/profile/interests", {
    interestTagIds: [],
    freeText: ["church"],
  });
  check(
    "free text about religion is refused (422 SENSITIVE_CONTENT)",
    r.status === 422 && r.body.reason === "SENSITIVE_CONTENT",
  );

  r = await call(cookieA, "PUT", "/profile/prompts", {
    promptIds: [prompts[0].id, prompts[0].id, prompts[1].id],
    answers: ["a", "b", "c"],
  });
  check(
    "the same prompt twice is refused (422 DUPLICATE_PROMPT)",
    r.status === 422 && r.body.reason === "DUPLICATE_PROMPT",
  );
  r = await call(cookieA, "PUT", "/profile/prompts", {
    promptIds: [prompts[0].id, prompts[1].id, prompts[2].id],
    answers: ["one", "two", "three"],
  });
  check("three prompts save", r.status === 200);

  r = await call(cookieA, "PUT", "/profile/values", { answers: [1, 2, 3, 4, 5, 1, 2, 3] });
  check("the values quiz saves", r.status === 200);

  r = await call(cookieA, "GET", "/profile");
  check(
    "reading the profile back shows every saved answer",
    r.body.firstName === "Jisoo" &&
      r.body.intents.length === 2 &&
      r.body.courses.length === 1 &&
      r.body.freeTimeSlots.join() === "2,14,30" &&
      r.body.prompts.length === 3 &&
      r.body.valuesAnswers.length === 8 &&
      r.body.freeText.join() === "origami",
    `step ${r.body.onboardingStep}`,
  );
  check("the wizard remembers how far A got", r.body.onboardingStep >= 8);

  r = await call(cookieA, "POST", "/profile/finish");
  check(
    "finishing without photos is refused, listing what is missing",
    r.status === 200 &&
      r.body.status === "incomplete" &&
      r.body.missing.length === 1 &&
      r.body.missing[0] === "photos",
    JSON.stringify(r.body),
  );

  // B granted the sensitive consent
  r = await call(cookieB, "PUT", "/profile/basics", {
    firstName: "Minho",
    gender: "MAN",
    year: 3,
    major,
    interestedIn: ["WOMAN"],
  });
  row = (
    await pool.query(
      `select "interestedIn" from profiles where "userId" = (select id from users where email = $1)`,
      [emailB],
    )
  ).rows[0];
  check(
    "B granted the consent, so the choice is stored ENCRYPTED (not readable as plain text in the database)",
    r.status === 200 && typeof row.interestedIn === "string" && !row.interestedIn.includes("WOMAN"),
  );
  r = await call(cookieB, "GET", "/profile");
  check(
    "and B reads it back decrypted, as their own",
    JSON.stringify(r.body.interestedIn) === JSON.stringify(["WOMAN"]),
  );
  r = await call(cookieB, "PUT", "/profile/intents", { intents: ["DATING"] });
  check("B may choose Dating (consent granted, no cohort gate here)", r.status === 200);
  r = await call(cookieA, "GET", "/profile");
  check(
    "B's choice is not in A's profile: A, who declined, has none stored",
    Array.isArray(r.body.interestedIn) && r.body.interestedIn.length === 0,
  );

  // clean up the extra campus and the fake users
  // Test users only. The consent ledger refuses to lose a user's rows by design (RESTRICT), so a
  // test clears them first, the same order e2e/helpers/db.ts uses.
  for (const email of [emailA, emailB]) {
    await pool.query(
      `delete from consents where "userId" = (select id from users where email = $1)`,
      [email],
    );
    await pool.query(`delete from users where email = $1`, [email]);
  }
  await pool.query(`delete from campuses where id = $1`, [otherCampus]);
  await pool.end();
  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
