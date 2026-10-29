import { NextResponse } from "next/server";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { exportMyDataStep } from "@/server/privacy/service";

/** L2's "download my data" — auth-gated, own-data-only (buildUserDataExport's own doc comment explains why it can't return anyone else's row). */
export async function GET() {
  const actor = await getActor();
  if (!actor) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const result = await exportMyDataStep(prisma, { userId: actor.userId });
  if (result.status === "error") {
    return NextResponse.json({ error: result.code }, { status: 404 });
  }
  const data = result.data;

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="overlap-my-data.json"',
    },
  });
}
