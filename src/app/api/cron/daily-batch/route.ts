import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { getEnv } from "@/server/env";
import { runDailyBatchForCampus } from "@/server/matching/run-daily-batch";

/**
 * The daily picks drop (REQUIREMENTS.md §5.3/C1, default 12:00 KST — vercel.json).
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; anyone else's request is
 * rejected the same way (CLAUDE.md: every route handler checks authorization itself).
 * Runs every campus's batch sequentially in one invocation — Month-1 campus counts and
 * the per-campus runtime S10 already measured (a 1,000-user campus scores every intent
 * in a few seconds) keep this well inside a serverless function's time budget; if that
 * stops being true, this is the seam where per-campus fan-out would get added.
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const campuses = await prisma.campus.findMany({ select: { id: true } });
  const results = [];
  for (const campus of campuses) {
    results.push(await runDailyBatchForCampus(prisma, campus.id));
  }

  return NextResponse.json({ campusesProcessed: results.length, results });
}

function isAuthorized(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${getEnv().CRON_SECRET}`;
  const provided = Buffer.from(header);
  const wanted = Buffer.from(expected);
  return provided.length === wanted.length && timingSafeEqual(provided, wanted);
}
