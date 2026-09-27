import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { captureError } from "@/server/logging";

/**
 * S21's uptime-monitor wiring point. Unauthenticated by design (an external uptime
 * service pings this with no credentials) and returns nothing but liveness — no personal
 * data, no counts, nothing an unauthenticated caller shouldn't see. Signing up for a real
 * uptime service is paused with everything else in O3 during the local-only phase; this
 * endpoint is the app-side half that's safe to build now regardless, since it needs no
 * external account.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() });
  } catch (error) {
    captureError("api.health", error);
    return NextResponse.json({ status: "error", timestamp: new Date().toISOString() }, { status: 503 });
  }
}
