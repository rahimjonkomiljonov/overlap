import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { runRetentionJob } from "../src/server/privacy/retention";

/**
 * Runs the S19 retention job (L3: §15.4's selfie/message/report-evidence/account purge
 * rules) locally without the HTTP route or CRON_SECRET — for local dev/staging
 * verification, mirroring scripts/run-chat-lifecycle.ts and scripts/run-notifications.ts.
 *
 * Usage: tsx scripts/run-retention.ts
 */
async function main() {
  loadEnv({ path: ".env.local" });

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const result = await runRetentionJob(prisma);
  console.log(
    `Purged: ${result.selfies} selfie(s), ${result.messages} message(s), ${result.reportEvidence} report evidence, ${result.accounts} account(s).`,
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
