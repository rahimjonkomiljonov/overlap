import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * CLI to create a real Campus + its first EmailDomain (O4) — there's no admin UI for
 * this yet, on purpose: campus onboarding is rare and operational, not a user-facing
 * feature. `scripts/import-reference.ts` requires the EmailDomain to already exist
 * before it can resolve which campus a CSV directory belongs to.
 *
 * Usage: tsx scripts/create-campus.ts --name "Gachon University Global Campus" --domain gachon.ac.kr
 *
 * Idempotent: re-running with the same --domain is a no-op (EmailDomain.domain is
 * unique), it won't create a duplicate Campus.
 */
async function main() {
  loadEnv({ path: ".env.local" });

  const args = process.argv.slice(2);
  const name = argOf(args, "--name");
  const domain = argOf(args, "--domain")?.toLowerCase();
  if (!name || !domain) {
    console.error('Usage: tsx scripts/create-campus.ts --name "Campus Name" --domain example.ac.kr');
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const existing = await prisma.emailDomain.findUnique({ where: { domain }, include: { campus: true } });
    if (existing) {
      console.log(`EmailDomain "${domain}" already exists, campus "${existing.campus.name}" (${existing.campusId}). No change made.`);
      return;
    }

    const campus = await prisma.campus.create({ data: { name } });
    const emailDomain = await prisma.emailDomain.create({ data: { campusId: campus.id, domain } });
    console.log(`Created campus "${campus.name}" (${campus.id}) with email domain "${emailDomain.domain}".`);
  } finally {
    await prisma.$disconnect();
  }
}

function argOf(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

main();
