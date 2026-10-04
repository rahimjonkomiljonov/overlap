import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { computeCohortDensity, DENSITY_GATE } from "../src/server/cohorts/release";

/**
 * S26 density gate. Lists every cohort on a campus with its eligible pool (active,
 * selfie-verified, 19+) and whether it passes the gate. With --open, turns Dating on for
 * one cohort, but only if it passes. There is deliberately no force flag: §6 says Dating
 * opens per cohort only when the gate passes.
 *
 * Usage: tsx scripts/cohort-status.ts --domain gachon.ac.kr [--open "Ambassadors 1"]
 *        tsx scripts/cohort-status.ts --domain gachon.ac.kr --close "Ambassadors 1"
 */
async function main() {
  loadEnv({ path: ".env.local" });

  const args = process.argv.slice(2);
  const arg = (flag: string) => {
    const i = args.indexOf(flag);
    return i === -1 ? undefined : args[i + 1];
  };
  const domain = arg("--domain")?.toLowerCase();
  const toOpen = arg("--open");
  const toClose = arg("--close");
  if (!domain) {
    console.error(
      'Usage: tsx scripts/cohort-status.ts --domain <campus domain> [--open|--close "<cohort>"]',
    );
    process.exit(1);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    const emailDomain = await prisma.emailDomain.findUnique({ where: { domain } });
    if (!emailDomain) {
      console.error(`No campus for email domain "${domain}".`);
      process.exitCode = 1;
      return;
    }

    const cohorts = await prisma.cohort.findMany({
      where: { campusId: emailDomain.campusId },
      orderBy: { createdAt: "asc" },
      include: { inviteCodes: { select: { useCount: true, maxUses: true } } },
    });
    if (cohorts.length === 0) console.log("No cohorts yet. Create one with db:create-cohort.");

    const pct = (n: number) => `${Math.round(n * 100)}%`;
    console.log(
      `Gate: >= ${DENSITY_GATE.minEligibleUsers} eligible, women and men each >= ${pct(DENSITY_GATE.minGenderShare)}\n`,
    );
    for (const cohort of cohorts) {
      const d = await computeCohortDensity(prisma, cohort.id);
      const used = cohort.inviteCodes.reduce((s, c) => s + c.useCount, 0);
      const capacity = cohort.inviteCodes.reduce((s, c) => s + c.maxUses, 0);
      console.log(
        `${cohort.name}: Dating ${cohort.datingOpen ? "OPEN" : "closed"} | invites ${used}/${capacity} used | ` +
          `${d.eligible} eligible (women ${pct(d.womenShare)}, men ${pct(d.menShare)}, other ${d.other}) | ` +
          `gate ${d.passes ? "PASSES" : "not yet"}`,
      );
    }

    const target = toOpen ?? toClose;
    if (target) {
      const cohort = cohorts.find((c) => c.name === target);
      if (!cohort) {
        console.error(`\nNo cohort named "${target}" on this campus.`);
        process.exitCode = 1;
        return;
      }
      if (toOpen) {
        const d = await computeCohortDensity(prisma, cohort.id);
        if (!d.passes) {
          console.error(`\nNot opening "${target}": it doesn't pass the density gate yet.`);
          process.exitCode = 1;
          return;
        }
      }
      await prisma.cohort.update({
        where: { id: cohort.id },
        data: { datingOpen: Boolean(toOpen) },
      });
      console.log(`\nDating is now ${toOpen ? "OPEN" : "closed"} for "${target}".`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();
