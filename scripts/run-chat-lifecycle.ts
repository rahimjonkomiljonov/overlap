import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { expireSilentConversations, sendSilenceNudges } from "../src/server/chat/lifecycle";

/**
 * Runs the chat lifecycle job (D5: 72h nudge, 7-day expiry) locally without the HTTP
 * route or CRON_SECRET — for local dev/staging verification, mirroring
 * scripts/run-daily-batch.ts.
 *
 * Usage: tsx scripts/run-chat-lifecycle.ts
 */
async function main() {
  loadEnv({ path: ".env.local" });

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const nudged = await sendSilenceNudges(prisma);
  const expired = await expireSilentConversations(prisma);
  console.log(`Nudged ${nudged} conversation(s), expired ${expired} conversation(s).`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
