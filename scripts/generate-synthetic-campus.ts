import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { assertNoSyntheticUsersInProduction } from "../src/server/synthetic/guard";
import { planSyntheticCampus } from "../src/server/synthetic/plan";
import { persistSyntheticCampus } from "../src/server/synthetic/persist";

const DEFAULT_USER_COUNT = 750;
const DEFAULT_COMMUNITY_COUNT = 15;
const DEFAULT_SEED = 20260924;

/**
 * Dev/staging-only generator (S09): seeds a campus with 500-1,000 synthetic users in
 * planted communities, for S10's offline matching evaluation (REQUIREMENTS.md §5.5).
 * Deterministic — the same `--seed` always regenerates the same campus.
 *
 * Usage: tsx scripts/generate-synthetic-campus.ts --domain test.ac.kr [--users 750]
 *   [--communities 15] [--seed 20260924]
 */
async function main() {
  loadEnv({ path: ".env.local" });

  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to generate synthetic users: NODE_ENV is production.");
  }

  const args = process.argv.slice(2);
  const domain = argOf(args, "--domain");
  if (!domain) {
    console.error(
      "Usage: tsx scripts/generate-synthetic-campus.ts --domain <campus email domain> [--users N] [--communities N] [--seed N]",
    );
    process.exit(1);
  }
  const userCount = intArgOf(args, "--users") ?? DEFAULT_USER_COUNT;
  const communityCount = intArgOf(args, "--communities") ?? DEFAULT_COMMUNITY_COUNT;
  const seed = intArgOf(args, "--seed") ?? DEFAULT_SEED;

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  await assertNoSyntheticUsersInProduction(prisma);

  const emailDomain = await prisma.emailDomain.findUnique({ where: { domain } });
  if (!emailDomain) {
    console.error(`No campus found for email domain "${domain}". Create the Campus and EmailDomain rows first.`);
    await prisma.$disconnect();
    process.exit(1);
  }
  const campusId = emailDomain.campusId;

  const [courses, clubs, interestTags, prompts] = await Promise.all([
    prisma.course.findMany({ where: { campusId, active: true }, select: { id: true } }),
    prisma.club.findMany({ where: { campusId, active: true }, select: { id: true } }),
    prisma.interestTag.findMany({ where: { active: true }, select: { id: true } }),
    prisma.prompt.findMany({ where: { active: true }, select: { id: true } }),
  ]);

  const plan = planSyntheticCampus(
    { campusId, seed, userCount, communityCount },
    {
      courseIds: courses.map((c) => c.id),
      clubIds: clubs.map((c) => c.id),
      interestTagIds: interestTags.map((t) => t.id),
      promptIds: prompts.map((p) => p.id),
    },
  );

  const { createdUsers } = await persistSyntheticCampus(prisma, plan);
  console.log(
    `Created ${createdUsers} synthetic users across ${communityCount} planted communities on campus ${campusId} (seed ${seed}).`,
  );
  await prisma.$disconnect();
}

function argOf(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

function intArgOf(args: string[], flag: string): number | undefined {
  const value = argOf(args, flag);
  return value === undefined ? undefined : Number.parseInt(value, 10);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
