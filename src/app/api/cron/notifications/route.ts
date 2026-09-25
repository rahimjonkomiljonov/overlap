import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { getEnv } from "@/server/env";
import { processQueuedNotifications } from "@/server/notifications/queue";
import { findAndQueueUnreadMessageNotifications } from "@/server/notifications/unread";

/**
 * S18's service-email job: queue any newly-1h-unread messages, then send whatever's
 * queued unless it's quiet hours (21:00-08:00 Seoul) — mirrors chat-lifecycle's cron
 * route (CLAUDE.md: every route handler checks authorization itself). Hourly cadence
 * (vercel.json) is what makes the "after 1h" trigger and quiet-hours end both get
 * caught promptly without a per-event timer.
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const queued = await findAndQueueUnreadMessageNotifications(prisma);
  const result = await processQueuedNotifications(prisma);

  return NextResponse.json({ queued, ...result });
}

function isAuthorized(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${getEnv().CRON_SECRET}`;
  const provided = Buffer.from(header);
  const wanted = Buffer.from(expected);
  return provided.length === wanted.length && timingSafeEqual(provided, wanted);
}
