import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { getEnv } from "@/server/env";
import { expireSilentConversations, sendSilenceNudges } from "@/server/chat/lifecycle";

/**
 * D5's chat lifecycle: nudge conversations silent ≥72h, expire ones silent ≥7 days.
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; anyone else's request is
 * rejected the same way daily-batch's cron route is (CLAUDE.md: every route handler
 * checks authorization itself).
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const nudged = await sendSilenceNudges(prisma);
  const expired = await expireSilentConversations(prisma);

  return NextResponse.json({ nudged, expired });
}

function isAuthorized(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${getEnv().CRON_SECRET}`;
  const provided = Buffer.from(header);
  const wanted = Buffer.from(expected);
  return provided.length === wanted.length && timingSafeEqual(provided, wanted);
}
