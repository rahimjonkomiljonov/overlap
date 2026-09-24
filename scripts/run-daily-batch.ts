import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { runDailyBatchForCampus } from "../src/server/matching/run-daily-batch";

/**
 * Runs the daily-batch job locally without the HTTP route or CRON_SECRET — what
 * `/api/cron/daily-batch` calls per campus, run directly for local dev/staging
 * verification (S11's own "Done when": every synthetic user gets 6 picks per intent,
 * the cap holds, a second run changes nothing).
 *
 * Usage: tsx scripts/run-daily-batch.ts --domain test.ac.kr
 */
async function main() {
  loadEnv({ path: ".env.local" });

  const args = process.argv.slice(2);
  const domain = argOf(args, "--domain");
  if (!domain) {
    console.error("Usage: tsx scripts/run-daily-batch.ts --domain <campus email domain>");
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const emailDomain = await prisma.emailDomain.findUnique({ where: { domain } });
  if (!emailDomain) {
    console.error(`No campus found for email domain "${domain}".`);
    await prisma.$disconnect();
    process.exit(1);
  }

  const summary = await runDailyBatchForCampus(prisma, emailDomain.campusId);
  console.log(`Campus ${summary.campusId}, batch date ${summary.batchDate}:`);
  for (const intent of summary.intents) {
    console.log(
      `  ${intent.intent}: eligible=${intent.eligibleUsers} alreadyBatched=${intent.alreadyBatched} ` +
        `newlyBatched=${intent.newlyBatched} lowDensity=${intent.lowDensityCount}`,
    );
  }
  await prisma.$disconnect();
}

function argOf(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
