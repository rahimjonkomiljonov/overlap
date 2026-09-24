import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { purgeSelfies } from "../src/server/verification/purge";

/**
 * CLI for the selfie purge job (A4: deleted within 7 days of the decision). Run on a
 * schedule once real Cron infrastructure exists (S11+); until then, run manually or
 * via any external scheduler pointed at this command.
 *
 * Usage: tsx scripts/purge-selfies.ts
 */
async function main() {
  loadEnv({ path: ".env.local" });

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const count = await purgeSelfies(prisma);
  console.log(`Purged ${count} selfie image(s) past the retention window.`);

  await prisma.$disconnect();
}

main();
