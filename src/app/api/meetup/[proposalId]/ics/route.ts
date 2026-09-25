import { NextResponse } from "next/server";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { buildIcs } from "@/server/meetup/ics";

/** E2's calendar export — auth-gated (unlike the public /plan/[token] share link) since it's reached only from the meetup page itself. */
export async function GET(_request: Request, { params }: { params: Promise<{ proposalId: string }> }) {
  const actor = await getActor();
  if (!actor) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const { proposalId } = await params;
  const proposal = await prisma.meetProposal.findUnique({
    where: { id: proposalId },
    select: {
      id: true,
      status: true,
      scheduledStart: true,
      scheduledEnd: true,
      spot: { select: { name: true } },
      match: { select: { userAId: true, userBId: true } },
    },
  });
  if (!proposal || (proposal.match.userAId !== actor.userId && proposal.match.userBId !== actor.userId)) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (proposal.status !== "ACCEPTED") {
    return NextResponse.json({ error: "NOT_ACCEPTED" }, { status: 409 });
  }

  const ics = buildIcs({
    uid: `meetup-${proposal.id}@overlap.app`,
    start: proposal.scheduledStart,
    end: proposal.scheduledEnd,
    summary: "Overlap 만남",
    location: proposal.spot.name,
  });

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="overlap-meetup.ics"',
    },
  });
}
