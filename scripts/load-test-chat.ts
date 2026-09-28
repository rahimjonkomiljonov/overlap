import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadEnv } from "dotenv";
import { Agent, setGlobalDispatcher } from "undici";
import { PrismaClient } from "../src/generated/prisma/client";

// Node's default fetch dispatcher (undici) caps concurrent connections per origin well
// below what this load test fires at once — without this, the test measures its own
// HTTP client queueing, not the server (see docs/BUILD_PLAN.md S23 log).
setGlobalDispatcher(new Agent({ connections: 1000 }));

/**
 * S23 load test: N real, signed-in users concurrently polling N distinct real
 * conversations through the actual running HTTP server (not an in-process call), the
 * same way the chat thread's 3s poll does. Mints real Better Auth sessions via the
 * OTP flow's own server API (auth.api.sendVerificationOTP / signInEmailOTP with
 * `returnHeaders: true`, which returns the signed Set-Cookie header directly instead of
 * trying to write one through next/headers — there's no live Next.js request here to
 * write one into) rather than fabricating a cookie by hand.
 *
 * Requires a running `next start`/`next dev` server at BASE_URL, migrated+seeded with at
 * least `--pairs` synthetic users already present (see generate-synthetic-campus.ts).
 *
 * Usage: tsx scripts/load-test-chat.ts --domain test.ac.kr --pairs 200 --rounds 5
 */
async function main() {
  loadEnv({ path: ".env.local" });

  const args = process.argv.slice(2);
  const domain = argOf(args, "--domain") ?? "test.ac.kr";
  const pairs = intArgOf(args, "--pairs") ?? 200;
  const rounds = intArgOf(args, "--rounds") ?? 5;
  const baseUrl = argOf(args, "--base-url") ?? "http://localhost:3000";

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const { auth } = await import("../src/server/auth/auth");
  const { readLastOtpCode } = await import("../e2e/helpers/dev-outbox");

  const emailDomain = await prisma.emailDomain.findUnique({ where: { domain } });
  if (!emailDomain) throw new Error(`No campus found for domain ${domain}`);

  const users = await prisma.user.findMany({
    where: { campusId: emailDomain.campusId, isSynthetic: true },
    select: { id: true, email: true },
    take: pairs * 2,
    orderBy: { createdAt: "asc" },
  });
  if (users.length < pairs * 2) {
    throw new Error(`Need ${pairs * 2} synthetic users, found ${users.length}. Generate more first.`);
  }

  console.log(`Setting up ${pairs} matches/conversations...`);
  const conversations: { id: string; pollerEmail: string }[] = [];
  for (let i = 0; i < pairs; i++) {
    const a = users[i * 2];
    const b = users[i * 2 + 1];
    const [userAId, userBId] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];

    const match = await prisma.match.upsert({
      where: { userAId_userBId: { userAId, userBId } },
      update: {},
      create: { userAId, userBId },
    });
    const conversation = await prisma.conversation.upsert({
      where: { matchId: match.id },
      update: {},
      create: { matchId: match.id },
    });
    const existing = await prisma.message.count({ where: { conversationId: conversation.id } });
    if (existing === 0) {
      await prisma.message.create({
        data: { conversationId: conversation.id, senderId: userAId, text: "load test seed message" },
      });
    }
    conversations.push({ id: conversation.id, pollerEmail: a.email });
  }

  console.log(`Signing in ${pairs} pollers via the real OTP flow...`);
  const cookies: string[] = [];
  for (const { pollerEmail } of conversations) {
    const after = new Date();
    await auth.api.sendVerificationOTP({ body: { email: pollerEmail, type: "sign-in" } });
    const code = await readLastOtpCode(pollerEmail, { after, timeoutMs: 5000 });
    const result = await auth.api.signInEmailOTP({
      body: { email: pollerEmail, otp: code },
      returnHeaders: true,
    });
    const setCookie = result.headers.get("set-cookie");
    if (!setCookie) throw new Error(`No Set-Cookie for ${pollerEmail}`);
    const cookiePair = setCookie.split(";")[0];
    cookies.push(cookiePair);
  }

  console.log(`Firing ${rounds} rounds of ${pairs} concurrent pollers against ${baseUrl}...`);
  const allLatenciesMs: number[] = [];
  let errors = 0;
  for (let round = 0; round < rounds; round++) {
    const started = performance.now();
    const results = await Promise.all(
      conversations.map(async (c, i) => {
        const t0 = performance.now();
        try {
          const res = await fetch(`${baseUrl}/api/chat/${c.id}`, {
            headers: { cookie: cookies[i] },
          });
          const t1 = performance.now();
          if (!res.ok) {
            errors++;
            console.error(`  non-2xx: ${res.status} for conversation ${c.id}`);
          }
          await res.json();
          return t1 - t0;
        } catch (err) {
          errors++;
          console.error(`  request failed: ${(err as Error).message}`);
          return null;
        }
      }),
    );
    const roundLatencies = results.filter((r): r is number => r !== null);
    allLatenciesMs.push(...roundLatencies);
    console.log(
      `  round ${round + 1}: wall=${(performance.now() - started).toFixed(0)}ms, ` +
        `n=${roundLatencies.length}, p50=${percentile(roundLatencies, 50).toFixed(0)}ms, ` +
        `p95=${percentile(roundLatencies, 95).toFixed(0)}ms`,
    );
  }

  console.log("\n=== Summary ===");
  console.log(`Total requests: ${allLatenciesMs.length + errors}, errors: ${errors}`);
  console.log(`p50: ${percentile(allLatenciesMs, 50).toFixed(1)}ms`);
  console.log(`p90: ${percentile(allLatenciesMs, 90).toFixed(1)}ms`);
  console.log(`p95: ${percentile(allLatenciesMs, 95).toFixed(1)}ms`);
  console.log(`p99: ${percentile(allLatenciesMs, 99).toFixed(1)}ms`);
  console.log(`max: ${Math.max(...allLatenciesMs).toFixed(1)}ms`);

  await prisma.$disconnect();
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

function argOf(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}
function intArgOf(args: string[], flag: string): number | undefined {
  const v = argOf(args, flag);
  return v === undefined ? undefined : parseInt(v, 10);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
