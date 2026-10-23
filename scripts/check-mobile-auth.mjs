// Mobile sign-in and session checks (BUILD_PLAN M02) against a running LOCAL stack: the website on
// localhost with a throwaway database. It creates fake users and edits sessions directly, so it
// refuses to run against anything else.
//   npm run dev   (with the throwaway database's env), then:   node scripts/check-mobile-auth.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.CHECK_BASE_URL || "http://localhost:3000";
const DATABASE_URL = process.env.DATABASE_URL || "";
const OUTBOX = path.join(here, "..", ".dev-outbox.jsonl");
if (!BASE.startsWith("http://localhost") || !/@(localhost|127.0.0.1)[:/]/.test(DATABASE_URL)) {
  console.error("Refusing to run: this script needs a localhost website (CHECK_BASE_URL) and a localhost DATABASE_URL.");
  process.exit(2);
}
const pool = new Pool({ connectionString: DATABASE_URL });
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function signUp(email) {
  const h = { "Content-Type": "application/json", "expo-origin": "overlap://" };
  await fetch(`${BASE}/api/auth/email-otp/send-verification-otp`, { method: "POST", headers: h, body: JSON.stringify({ email, type: "sign-in" }) });
  await sleep(800);
  const line = fs.readFileSync(OUTBOX, "utf8").trim().split("\n").reverse().find((l) => l.includes(`"to":"${email}"`));
  const code = /code is (\d+)/.exec(line)[1];
  const res = await fetch(`${BASE}/api/auth/sign-in/email-otp`, { method: "POST", headers: h, body: JSON.stringify({ email, otp: code }) });
  const cookie = (res.headers.get("set-cookie") || "").split(";")[0];
  return { cookie, status: res.status };
}
const me = (cookie, version = "0.1.0") => fetch(`${BASE}/api/mobile/v1/me`, { headers: { "x-app-version": version, ...(cookie ? { Cookie: cookie } : {}) } });

(async () => {
  const email = `m02.check.${Date.now()}@test.ac.kr`;
  const { cookie, status } = await signUp(email);
  check("sign-in with a school email returns a session cookie", status === 200 && cookie.startsWith("better-auth.session_token="));

  let r = await me(cookie);
  let body = await r.json();
  check("/me with a valid session returns the caller's own account", r.status === 200 && body.email === email && body.status === "ACTIVE" && body.accountSetupComplete === false, JSON.stringify(body).slice(0, 110));
  check("/me never returns fields beyond the documented ones", Object.keys(body).sort().join() === "accountSetupComplete,email,name,role,status,userId");

  r = await me("better-auth.session_token=not-a-real-token");
  check("/me with a made-up cookie is 401", r.status === 401);

  // wrong user: someone else's account state never leaks through this session
  const other = await signUp(`m02.other.${Date.now()}@test.ac.kr`);
  body = await (await me(other.cookie)).json();
  check("a second session sees only its own account", body.email !== email && body.email.startsWith("m02.other."));

  // paused account: allowed on /me (so the app can explain), status reported
  await pool.query(`update users set status = 'PAUSED' where email = $1`, [email]);
  r = await me(cookie); body = await r.json();
  check("a paused account can still read /me and sees its status", r.status === 200 && body.status === "PAUSED");

  // deleted account: treated as signed out
  await pool.query(`update users set status = 'DELETED' where email = $1`, [email]);
  r = await me(cookie);
  check("a deleted account is refused with 401", r.status === 401);
  await pool.query(`update users set status = 'ACTIVE' where email = $1`, [email]);
  r = await me(cookie);
  check("and works again once active (the check is live, not cached)", r.status === 200);

  // expired session
  await pool.query(`update sessions set "expiresAt" = now() - interval '1 day' where "userId" = (select id from users where email = $1)`, [email]);
  r = await me(cookie);
  check("an expired session is refused with 401", r.status === 401);

  // session whose user row vanished
  const gone = await signUp(`m02.gone.${Date.now()}@test.ac.kr`);
  const goneEmail = (await (await me(gone.cookie)).json()).email;
  await pool.query(`delete from sessions where "userId" = (select id from users where email = $1)`, [goneEmail]);
  r = await me(gone.cookie);
  check("a revoked session is refused with 401", r.status === 401);

  // brute force: the code is locked after a few wrong tries
  const bf = `m02.brute.${Date.now()}@test.ac.kr`;
  const h = { "Content-Type": "application/json", "expo-origin": "overlap://" };
  await fetch(`${BASE}/api/auth/email-otp/send-verification-otp`, { method: "POST", headers: h, body: JSON.stringify({ email: bf, type: "sign-in" }) });
  await sleep(800);
  const line = fs.readFileSync(OUTBOX, "utf8").trim().split("\n").reverse().find((l) => l.includes(`"to":"${bf}"`));
  const realCode = /code is (\d+)/.exec(line)[1];
  const wrong = realCode === "000000" ? "111111" : "000000";
  const statuses = [];
  for (let i = 0; i < 5; i++) statuses.push((await fetch(`${BASE}/api/auth/sign-in/email-otp`, { method: "POST", headers: h, body: JSON.stringify({ email: bf, otp: wrong }) })).status);
  const after = await fetch(`${BASE}/api/auth/sign-in/email-otp`, { method: "POST", headers: h, body: JSON.stringify({ email: bf, otp: realCode }) });
  check("after repeated wrong codes, even the right code is refused", statuses.every((s) => s >= 400) && after.status >= 400, `wrong tries: ${statuses.join(",")}, then right code: ${after.status}`);

  // raw routes are not a way around the school-email rule
  const gm = await fetch(`${BASE}/api/auth/email-otp/send-verification-otp`, { method: "POST", headers: h, body: JSON.stringify({ email: "someone@gmail.com", type: "sign-in" }) });
  check("a personal address is refused on the raw route", gm.status === 400);

  await pool.end();
  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
