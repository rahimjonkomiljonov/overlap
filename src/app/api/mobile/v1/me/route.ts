import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { mobileError } from "@/server/mobile/guard";
import { mobileRoute } from "@/server/mobile/route";

/**
 * Who is signed in, as the app needs it right after sign-in: the account's own identity fields and
 * where they are in setup. Only ever the caller's own row. `allowRestricted` because a paused or
 * suspended person must still be able to see that, rather than getting an error.
 */
export const GET = mobileRoute(
  "me",
  async ({ actor }) => {
    const user = await prisma.user.findUnique({ where: { id: actor.userId }, select: { email: true, name: true } });
    if (!user) return mobileError("UNAUTHENTICATED");
    return NextResponse.json(
      {
        userId: actor.userId,
        email: user.email,
        name: user.name,
        role: actor.role,
        status: actor.status,
        // Account setup (campus, age, consents) is the next screen flow; profile setup comes after it.
        accountSetupComplete: actor.campusId !== "",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  },
  { allowRestricted: true },
);
