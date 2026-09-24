import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { computeIdfStats } from "../src/server/matching/idf";

/**
 * Runs the IDF-refresh job (S09) by hand. S11 wires the same `computeIdfStats` function
 * to an actual nightly cron; this CLI is what to run locally against a campus that's
 * changed (e.g. right after generating or regenerating a synthetic one).
 *
 * Usage: tsx scripts/compute-idf-stats.ts --domain test.ac.kr
 */
async function main() {
  loadEnv({ path: ".env.local" });

  const args = process.argv.slice(2);
  const domain = argOf(args, "--domain");
  if (!domain) {
    console.error("Usage: tsx scripts/compute-idf-stats.ts --domain <campus email domain>");
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

  const summary = await computeIdfStats(prisma, emailDomain.campusId);
  console.log(
    `Refreshed IDF stats for campus ${emailDomain.campusId}: ${summary.statsWritten} feature(s) over ${summary.eligibleUserCount} eligible user(s).`,
  );
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
