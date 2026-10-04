import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { generateInviteCode } from "../src/server/cohorts/release";

/**
 * S26 / J2: create a cohort on a campus and mint invite codes for it. Re-running with the
 * same cohort name adds more codes to the existing cohort instead of creating a second one.
 * Prints the codes so they can be handed to ambassadors.
 *
 * Usage: tsx scripts/create-cohort.ts --domain gachon.ac.kr --name "Ambassadors 1" \
 *          --codes 20 [--max-uses 1] [--expires-days 14] [--owner ambassador@gachon.ac.kr]
 *
 * --owner assigns the new codes to an existing user and makes them an AMBASSADOR (if
 * they're a plain USER), so the codes and their activation show on /ambassador (J4).
 */
async function main() {
  loadEnv({ path: ".env.local" });

  const args = process.argv.slice(2);
  const arg = (flag: string) => {
    const i = args.indexOf(flag);
    return i === -1 ? undefined : args[i + 1];
  };
  const domain = arg("--domain")?.toLowerCase();
  const name = arg("--name");
  const count = Number(arg("--codes") ?? "10");
  const maxUses = Number(arg("--max-uses") ?? "1");
  const expiresDays = arg("--expires-days") ? Number(arg("--expires-days")) : undefined;
  const ownerEmail = arg("--owner")?.toLowerCase();
  if (
    !domain ||
    !name ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 1000 ||
    !(maxUses >= 1)
  ) {
    console.error(
      'Usage: tsx scripts/create-cohort.ts --domain <campus domain> --name "<cohort>" --codes <1-1000> [--max-uses N] [--expires-days N] [--owner <email>]',
    );
    process.exit(1);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    const emailDomain = await prisma.emailDomain.findUnique({ where: { domain } });
    if (!emailDomain) {
      console.error(`No campus for email domain "${domain}". Run db:create-campus first.`);
      process.exitCode = 1;
      return;
    }

    let ownerId: string | null = null;
    if (ownerEmail) {
      const owner = await prisma.user.findUnique({ where: { email: ownerEmail }, select: { id: true, role: true, campusId: true } });
      if (!owner || owner.campusId !== emailDomain.campusId) {
        console.error(`No user "${ownerEmail}" on this campus. They need to sign up first.`);
        process.exitCode = 1;
        return;
      }
      ownerId = owner.id;
      if (owner.role === "USER") await prisma.user.update({ where: { id: owner.id }, data: { role: "AMBASSADOR" } });
    }

    const cohort = await prisma.cohort.upsert({
      where: { campusId_name: { campusId: emailDomain.campusId, name } },
      create: { campusId: emailDomain.campusId, name },
      update: {},
    });

    const expiresAt = expiresDays ? new Date(Date.now() + expiresDays * 86_400_000) : null;
    const codes = new Set<string>();
    while (codes.size < count) codes.add(generateInviteCode());
    await prisma.inviteCode.createMany({
      data: [...codes].map((code) => ({ cohortId: cohort.id, code, maxUses, expiresAt, ownerId })),
      skipDuplicates: true,
    });

    console.log(
      `Cohort "${cohort.name}" (${cohort.id}), Dating ${cohort.datingOpen ? "open" : "closed"}`,
    );
    console.log(
      `${codes.size} code(s), ${maxUses} use(s) each${expiresAt ? `, expire ${expiresAt.toISOString()}` : ""}:`,
    );
    for (const code of codes) console.log(code);
  } finally {
    await prisma.$disconnect();
  }
}

main();
