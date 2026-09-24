import { NextResponse } from "next/server";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getMatches } from "@/server/waves/queries";

/** Polled by /matches every 15s (BUILD_PLAN S15's "15s for the list") to pick up newly formed matches without a manual refresh. */
export async function GET() {
  const actor = await getActor();
  if (!actor) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const matches = await getMatches(prisma, actor.userId);
  return NextResponse.json({ matches });
}
