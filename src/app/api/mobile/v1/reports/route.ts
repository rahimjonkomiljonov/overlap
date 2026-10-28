import { prisma } from "@/server/db";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { REPORT_RATE_LIMIT, fileReportHandler } from "@/server/mobile/safety";
import { fileReportStep } from "@/server/safety/service";
import { mobileRoute } from "@/server/mobile/route";

/** Report a person. They are hidden from the reporter immediately, before any moderator decision; from a chat, the last 50 messages go along as evidence. */
export const POST = mobileRoute(
  "reports.file",
  (context) =>
    fileReportHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, REPORT_RATE_LIMIT),
      fileReport: (person, input) => fileReportStep(prisma, person, input),
    }),
  { requireAccountSetup: true, idempotent: true },
);
