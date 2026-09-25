import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { processQueuedNotifications } from "../src/server/notifications/queue";
import { findAndQueueUnreadMessageNotifications } from "../src/server/notifications/unread";

/**
 * Runs the S18 service-email job locally without the HTTP route or CRON_SECRET — for
 * local dev/staging verification, mirroring scripts/run-chat-lifecycle.ts.
 *
 * Usage: tsx scripts/run-notifications.ts
 */
async function main() {
  loadEnv({ path: ".env.local" });

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const queued = await findAndQueueUnreadMessageNotifications(prisma);
  const result = await processQueuedNotifications(prisma);
  if (result.deferred) {
    console.log(`Queued ${queued} unread-message notification(s). Quiet hours — nothing sent.`);
  } else {
    console.log(`Queued ${queued} unread-message notification(s). Sent ${result.sent}, skipped ${result.skipped}.`);
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
