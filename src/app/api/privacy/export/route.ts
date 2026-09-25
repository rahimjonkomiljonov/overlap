import { NextResponse } from "next/server";
import { DataRequestType } from "@/generated/prisma/enums";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { createDataRequest } from "@/server/privacy/data-requests";
import { buildUserDataExport } from "@/server/privacy/export";

/** L2's "download my data" — auth-gated, own-data-only (buildUserDataExport's own doc comment explains why it can't return anyone else's row). */
export async function GET() {
  const actor = await getActor();
  if (!actor) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const data = await buildUserDataExport(prisma, actor.userId);
  if (!data) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  await createDataRequest(prisma, actor.userId, DataRequestType.ACCESS);

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="overlap-my-data.json"',
    },
  });
}
