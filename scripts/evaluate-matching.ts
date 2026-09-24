import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadEnv } from "dotenv";
import { IntentMode } from "../src/generated/prisma/enums";
import { PrismaClient } from "../src/generated/prisma/client";
import { computeCampusMatches } from "../src/server/matching/batch";
import { loadCampusMatchPool } from "../src/server/matching/candidates";
import { computeIdfStats } from "../src/server/matching/idf";
import { buildIdfLookup } from "../src/server/matching/terms";

const PRECISION_AT_K = 6;
const PRECISION_TARGET = 0.7;
const BATCH_TIME_BUDGET_MS = 60_000;

/**
 * S10's own two non-unit-testable "Done when" checks, run by hand against a real
 * synthetic campus (S09) the way S02's Lighthouse run and S06's autocomplete p95
 * measurement were: precision@6 (does a synthetic user's top 6 ranked candidates
 * actually skew toward their own planted community, REQUIREMENTS.md §5.5) and batch
 * runtime (does scoring the whole campus for one intent finish well under a minute).
 *
 * Usage: tsx scripts/evaluate-matching.ts --domain test.ac.kr [--intents FRIENDS,STUDY]
 */
async function main() {
  loadEnv({ path: ".env.local" });

  const args = process.argv.slice(2);
  const domain = argOf(args, "--domain");
  if (!domain) {
    console.error("Usage: tsx scripts/evaluate-matching.ts --domain <campus email domain> [--intents FRIENDS,STUDY,...]");
    process.exit(1);
  }
  const intents = (argOf(args, "--intents")?.split(",") ?? Object.values(IntentMode)) as IntentMode[];

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const emailDomain = await prisma.emailDomain.findUnique({ where: { domain } });
  if (!emailDomain) {
    console.error(`No campus found for email domain "${domain}".`);
    await prisma.$disconnect();
    process.exit(1);
  }
  const campusId = emailDomain.campusId;

  const idfSummary = await computeIdfStats(prisma, campusId);
  console.log(`IDF refreshed: ${idfSummary.statsWritten} feature(s) over ${idfSummary.eligibleUserCount} eligible user(s).\n`);
  const idfRows = await prisma.idfStat.findMany({ where: { campusId }, select: { featureType: true, featureId: true, idf: true } });
  const idf = buildIdfLookup(idfRows);

  const communityByUserId = new Map(
    (await prisma.user.findMany({ where: { campusId, isSynthetic: true }, select: { id: true, syntheticCommunity: true } })).map(
      (u) => [u.id, u.syntheticCommunity],
    ),
  );

  let anyFailed = false;
  let totalDurationMs = 0;

  for (const intent of intents) {
    const startedAt = Date.now();
    const pool = await loadCampusMatchPool(prisma, campusId, intent);
    const results = computeCampusMatches(pool, intent, idf);
    const durationMs = Date.now() - startedAt;
    totalDurationMs += durationMs;

    const precisions: number[] = [];
    for (const [userId, ranked] of results) {
      const ownCommunity = communityByUserId.get(userId);
      if (ownCommunity === undefined || ownCommunity === null) continue; // only synthetic users have ground truth
      const topK = ranked.slice(0, PRECISION_AT_K);
      if (topK.length === 0) continue;
      const correct = topK.filter((r) => communityByUserId.get(r.candidateUserId) === ownCommunity).length;
      precisions.push(correct / topK.length);
    }
    const meanPrecision = precisions.length > 0 ? precisions.reduce((a, b) => a + b, 0) / precisions.length : 0;

    const precisionOk = meanPrecision >= PRECISION_TARGET;
    const timeOk = durationMs <= BATCH_TIME_BUDGET_MS;
    if (!precisionOk || !timeOk) anyFailed = true;

    console.log(
      `${intent}: pool=${pool.profiles.length} users, evaluated=${precisions.length} synthetic users, ` +
        `precision@${PRECISION_AT_K}=${meanPrecision.toFixed(3)} (${precisionOk ? "PASS" : "FAIL"} target ${PRECISION_TARGET}), ` +
        `time=${durationMs}ms (${timeOk ? "PASS" : "FAIL"} budget ${BATCH_TIME_BUDGET_MS}ms)`,
    );
  }

  console.log(`\nTotal scoring time across ${intents.length} intent(s): ${totalDurationMs}ms.`);
  await prisma.$disconnect();
  process.exit(anyFailed ? 1 : 0);
}

function argOf(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
