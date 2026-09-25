import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { getEnv } from "@/server/env";
import { runRetentionJob } from "@/server/privacy/retention";

/**
 * L3's retention job: every §15.4 purge rule this codebase automates in one place
 * (selfies, expired-unmatched/deleted-account chat, closed-report evidence,
 * deleted-account PII) — same timing-safe-secret pattern as S11/S15/S18's cron routes
 * (CLAUDE.md: every route handler checks authorization itself).
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const result = await runRetentionJob(prisma);

  return NextResponse.json(result);
}

function isAuthorized(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${getEnv().CRON_SECRET}`;
  const provided = Buffer.from(header);
  const wanted = Buffer.from(expected);
  return provided.length === wanted.length && timingSafeEqual(provided, wanted);
}
