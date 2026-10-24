// Mobile photo and selfie checks (BUILD_PLAN M05b) against a running LOCAL stack: the website on
// localhost with a throwaway database and the local-development storage folder (.dev-storage). It
// uploads real image files and reads back what was stored, so it refuses to run against anything else.
//   npm run dev   (with the throwaway database's env), then:   node scripts/check-mobile-photos.mjs
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import sharp from "sharp";

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
// .env.local on this machine holds the REAL Supabase Storage address and key, and the website fills in any
// variable that is not already set, so "unset" is not enough. In the shell that starts the website AND this script,
// SUPABASE_SECRET_KEY must be set to an empty string (storage only turns on when it is non-empty) and the URL must not
// be a supabase.co address. (An earlier version of this script uploaded a test picture to real storage.)
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
const headers = (cookie) => ({ "x-app-version": "0.1.0", cookie });
const json = async (res) => ({ status: res.status, body: await res.json().catch(() => ({})) });
const getJson = (cookie, route) =>
  fetch(`${BASE}/api/mobile/v1${route}`, { headers: headers(cookie) }).then(json);
const upload = (cookie, route, field, bytes, type = "image/jpeg") => {
  const form = new FormData();
  form.set(field, new File([bytes], "upload.jpg", { type }));
  return fetch(`${BASE}/api/mobile/v1${route}`, {
    method: "POST",
    headers: headers(cookie),
    body: form,
  }).then(json);
};
const complete = (cookie) =>
  fetch(`${BASE}/api/mobile/v1/onboarding/account`, {
    method: "POST",
    headers: { ...headers(cookie), "content-type": "application/json" },
    body: JSON.stringify({
      birthYear: 2000,
      birthMonth: 5,
      birthDay: 17,
      attestedAdult: true,
      termsAccepted: true,
      sensitivePreference: false,
    }),
  }).then(json);
const picture = (color, width = 800, height = 600) =>
  sharp({ create: { width, height, channels: 3, background: color } })
    .jpeg()
    .toBuffer();
const storedFile = (bucket, key) => path.join(ROOT, ".dev-storage", bucket, key);
const keyOfUrl = (url) =>
  decodeURIComponent(new URL(url).pathname.replace("/api/dev-storage/profile-photos/", ""));

(async () => {
  // Read-only probe BEFORE any upload: with real Supabase Storage configured the storage route answers 404 to
  // everyone; in local-storage mode it asks for a sign-in first (401). Anything but 401 means "stop".
  const probe = await fetch(`${BASE}/api/dev-storage/profile-photos/probe`);
  if (probe.status !== 401) {
    console.error(
      `Refusing to upload: the website answered ${probe.status} to the storage probe, so it is not in local-storage mode (is real Supabase Storage configured for it?).`,
    );
    process.exit(2);
  }
  const stamp = Date.now();
  const emailA = `m05b.a.${stamp}@test.ac.kr`;
  const emailB = `m05b.b.${stamp}@test.ac.kr`;
  const emailC = `m05b.c.${stamp}@test.ac.kr`;
  const cookieA = await signUp(emailA);
  const cookieB = await signUp(emailB);
  const cookieC = await signUp(emailC); // never finishes account setup

  // An account that has not finished setup cannot upload anything
  let r = await upload(cookieC, "/profile/photos", "photo", await picture("#336699"));
  check(
    "before account setup, a photo upload is refused (403 ACCOUNT_SETUP_REQUIRED)",
    r.status === 403 && r.body.error === "ACCOUNT_SETUP_REQUIRED",
  );
  r = await upload(cookieC, "/verification/selfie", "selfie", await picture("#336699"));
  check("and so is a selfie", r.status === 403);

  await complete(cookieA);
  await complete(cookieB);

  // A first photo, with EXIF metadata (GPS, camera) on the original
  const original = fs.readFileSync(path.join(ROOT, "e2e/fixtures/photo-with-exif.jpg"));
  const originalMeta = await sharp(original).metadata();
  check(
    "the test picture really carries EXIF metadata before upload",
    Boolean(originalMeta.exif),
    `${originalMeta.exif?.length ?? 0} bytes`,
  );

  r = await upload(cookieA, "/profile/photos", "photo", original);
  check(
    "a photo uploads (201) and gets a full web address",
    r.status === 201 &&
      /^http:\/\/localhost:3000\/api\/dev-storage\/profile-photos\//.test(r.body.photo?.url ?? ""),
    r.body.photo?.url,
  );
  const first = r.body.photo;
  const firstKey = keyOfUrl(first.url);
  const stored = fs.readFileSync(storedFile("profile-photos", firstKey));
  const storedMeta = await sharp(stored).metadata();
  check(
    "the stored file carries NO EXIF metadata (location, camera, time are gone)",
    !storedMeta.exif && storedMeta.format === "jpeg",
  );
  check(
    "the stored file is the processed picture, not the original bytes",
    !stored.equals(original),
  );

  // Size cap on dimensions
  r = await upload(cookieA, "/profile/photos", "photo", await picture("#aa3366", 3200, 2400));
  const bigKey = keyOfUrl(r.body.photo.url);
  const bigMeta = await sharp(fs.readFileSync(storedFile("profile-photos", bigKey))).metadata();
  check(
    "a huge picture is shrunk to at most 1600 pixels on its long side",
    Math.max(bigMeta.width, bigMeta.height) <= 1600,
    `${bigMeta.width}x${bigMeta.height}`,
  );

  // Loading the address: needs the session, like the website's storage route
  let res = await fetch(first.url, { headers: { cookie: cookieA } });
  check(
    "the photo address loads for its owner with the session (200, image)",
    res.status === 200 && (res.headers.get("content-type") || "").startsWith("image/"),
  );
  res = await fetch(first.url);
  check("and not without a session (401)", res.status === 401);

  r = await getJson(cookieA, "/profile");
  check(
    "GET /profile lists the photos with full addresses, in order",
    r.body.photos.length === 2 &&
      r.body.photos.every((p) => p.url.startsWith("http://localhost:3000/")) &&
      r.body.photos[0].sortOrder < r.body.photos[1].sortOrder,
  );

  // Things that must be refused
  r = await upload(cookieA, "/profile/photos", "photo", randomBytes(2000), "image/jpeg");
  check(
    "bytes that are not a picture are refused even when labelled image/jpeg (INVALID_FILE_TYPE)",
    r.status === 422 && r.body.reason === "INVALID_FILE_TYPE",
  );
  r = await upload(cookieA, "/profile/photos", "photo", Buffer.from("hello"), "text/plain");
  check(
    "a file that says it is text is refused (INVALID_FILE_TYPE)",
    r.status === 422 && r.body.reason === "INVALID_FILE_TYPE",
  );
  r = await upload(cookieA, "/profile/photos", "photo", randomBytes(5 * 1024 * 1024), "image/jpeg");
  check(
    "a 5 MB file is refused with our own clear error (FILE_TOO_LARGE)",
    r.status === 422 && r.body.reason === "FILE_TOO_LARGE",
  );
  r = await upload(cookieA, "/profile/photos", "photo", Buffer.alloc(0), "image/jpeg");
  check("an empty file is refused", r.status === 422 || r.status === 400);
  r = await upload(cookieA, "/profile/photos", "selfie", await picture("#000000"));
  check(
    "the wrong field name is refused (400)",
    r.status === 400 && r.body.fields?.[0]?.name === "photo",
  );
  res = await fetch(`${BASE}/api/mobile/v1/profile/photos`, {
    method: "POST",
    headers: { ...headers(cookieA), "content-type": "application/json" },
    body: "{}",
  });
  check("a JSON body where a file belongs is refused (400)", res.status === 400);

  // The limit of six
  const ids = [first.id];
  for (let i = 2; i <= 6; i++) {
    r = await upload(
      cookieA,
      "/profile/photos",
      "photo",
      await picture(`#${i}${i}${i}${i}${i}${i}`),
    );
    if (r.status === 201) ids.push(r.body.photo.id);
  }
  const countRows = async (email) =>
    (
      await pool.query(
        `select count(*)::int n from photos where "profileId" = (select id from profiles where "userId" = (select id from users where email = $1))`,
        [email],
      )
    ).rows[0].n;
  check("up to six photos are accepted", (await countRows(emailA)) === 6);
  r = await upload(cookieA, "/profile/photos", "photo", await picture("#abcdef"));
  check(
    "a seventh is refused (TOO_MANY_PHOTOS) and nothing is stored",
    r.status === 422 && r.body.reason === "TOO_MANY_PHOTOS" && (await countRows(emailA)) === 6,
  );

  // Deleting
  r = await fetch(`${BASE}/api/mobile/v1/profile/photos/${ids[0]}`, {
    method: "DELETE",
    headers: headers(cookieB),
  }).then(json);
  check(
    "another person cannot delete my photo: it answers 404, like a photo that does not exist",
    r.status === 404 && fs.existsSync(storedFile("profile-photos", firstKey)),
  );
  r = await fetch(`${BASE}/api/mobile/v1/profile/photos/..%2F..%2Fetc`, {
    method: "DELETE",
    headers: headers(cookieA),
  }).then(json);
  check("an id that is not an id is refused (400)", r.status === 400);
  r = await fetch(`${BASE}/api/mobile/v1/profile/photos/${ids[0]}`, {
    method: "DELETE",
    headers: headers(cookieA),
  }).then(json);
  check(
    "deleting my own photo works and removes the stored file too",
    r.status === 200 &&
      r.body.status === "deleted" &&
      !fs.existsSync(storedFile("profile-photos", firstKey)) &&
      (await countRows(emailA)) === 5,
  );

  // Minimum of three once the profile is finished
  await pool.query(
    `update profiles set "completedAt" = now() where "userId" = (select id from users where email = $1)`,
    [emailA],
  );
  const outcomes = [];
  for (const id of ids.slice(1)) {
    outcomes.push(
      (
        await fetch(`${BASE}/api/mobile/v1/profile/photos/${id}`, {
          method: "DELETE",
          headers: headers(cookieA),
        }).then(json)
      ).status,
    );
  }
  check(
    "a finished profile can drop to three photos but no lower (the rest answer 422 MIN_PHOTOS)",
    (await countRows(emailA)) === 3 &&
      outcomes.filter((s) => s === 200).length === 2 &&
      outcomes.filter((s) => s === 422).length === 2,
    outcomes.join(","),
  );

  // Selfie
  r = await getJson(cookieB, "/verification");
  check(
    "a new person's verification is 'unsubmitted'",
    r.status === 200 && r.body.state === "unsubmitted",
  );
  r = await upload(cookieB, "/verification/selfie", "selfie", await picture("#c0a080"));
  check("a selfie uploads (201 submitted)", r.status === 201 && r.body.status === "submitted");
  r = await getJson(cookieB, "/verification");
  check("and verification is now 'pending'", r.body.state === "pending");
  r = await upload(cookieB, "/verification/selfie", "selfie", await picture("#c0a080"));
  check(
    "a second selfie while one is waiting is refused (ALREADY_PENDING)",
    r.status === 422 && r.body.reason === "ALREADY_PENDING",
  );
  const selfieKey = (
    await pool.query(
      `select "storageKey" from selfies where "userId" = (select id from users where email = $1)`,
      [emailB],
    )
  ).rows[0].storageKey;
  check(
    "the selfie is stored in its own private folder, separate from profile photos",
    fs.existsSync(storedFile("verification-selfies", selfieKey)) &&
      !fs.existsSync(storedFile("profile-photos", selfieKey)),
  );
  res = await fetch(`${BASE}/api/dev-storage/verification-selfies/${selfieKey}`, {
    headers: { cookie: cookieB },
  });
  check(
    "not even its owner can load the selfie back through the storage route (only a moderator can)",
    res.status === 403 || res.status === 404,
    `HTTP ${res.status}`,
  );
  res = await fetch(`${BASE}/api/dev-storage/verification-selfies/${selfieKey}`, {
    headers: { cookie: cookieA },
  });
  check(
    "and another person certainly cannot",
    res.status === 403 || res.status === 404,
    `HTTP ${res.status}`,
  );

  // Clean up: files and rows
  for (const email of [emailA, emailB]) {
    const keys = (
      await pool.query(
        `select "storageKey" from photos where "profileId" = (select id from profiles where "userId" = (select id from users where email = $1))`,
        [email],
      )
    ).rows.map((x) => x.storageKey);
    for (const key of keys) fs.rmSync(storedFile("profile-photos", key), { force: true });
  }
  fs.rmSync(storedFile("verification-selfies", selfieKey), { force: true });
  fs.rmSync(storedFile("profile-photos", bigKey), { force: true });
  for (const email of [emailA, emailB, emailC]) {
    const id = `(select id from users where email = $1)`;
    await pool.query(`delete from selfies where "userId" = ${id}`, [email]);
    await pool.query(
      `delete from photos where "profileId" in (select id from profiles where "userId" = ${id})`,
      [email],
    );
    await pool.query(`delete from consents where "userId" = ${id}`, [email]);
    await pool.query(`delete from users where email = $1`, [email]);
  }
  await pool.end();
  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
