import { setRequestLocale } from "next-intl/server";
import { MeetupPlanner } from "@/components/meetup/meetup-planner";
import { redirect } from "@/i18n/navigation";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import {
  getMeetupForMatch,
  getMeetupOptions,
  loadMatchForActor,
  otherUserId,
  type MeetupProposalView,
} from "@/server/meetup/queries";
import { customDayStarts } from "@/server/meetup/custom";
import { getEmergencyContacts } from "@/server/safety/emergency";

function isActiveProposal(
  proposal: MeetupProposalView,
): proposal is MeetupProposalView & { status: "PROPOSED" | "ACCEPTED" } {
  return proposal.status === "PROPOSED" || proposal.status === "ACCEPTED";
}

export default async function MeetupPage({ params }: PageProps<"/[locale]/meetup/[matchId]">) {
  const { locale, matchId } = await params;
  setRequestLocale(locale);

  const actor = await getActor();
  if (!actor) {
    redirect({ href: "/login", locale });
    return;
  }

  const match = await loadMatchForActor(prisma, matchId, actor.userId);
  if (!match || match.status !== "ACTIVE") {
    redirect({ href: "/matches", locale });
    return;
  }

  const latest = await getMeetupForMatch(prisma, match, actor.userId);
  const activeProposal = latest && isActiveProposal(latest) ? latest : null;
  const options = activeProposal ? [] : await getMeetupOptions(prisma, match);
  const safeSpots =
    activeProposal || !actor.campusId
      ? []
      : await prisma.spot.findMany({
          where: { campusId: actor.campusId, isSafeSpot: true, active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, nameEn: true },
        });
  const emergencyContacts = actor.campusId ? await getEmergencyContacts(prisma, actor.campusId) : [];

  return (
    <MeetupPlanner
      matchId={matchId}
      actorUserId={actor.userId}
      otherUserId={otherUserId(match, actor.userId)}
      proposal={
        activeProposal
          ? {
              ...activeProposal,
              scheduledStart: activeProposal.scheduledStart.toISOString(),
              scheduledEnd: activeProposal.scheduledEnd.toISOString(),
              shareLinks: activeProposal.shareLinks.map((l) => ({
                ...l,
                expiresAt: l.expiresAt.toISOString(),
                revokedAt: l.revokedAt?.toISOString() ?? null,
              })),
            }
          : null
      }
      options={options.map((o) => ({ ...o, start: o.start.toISOString(), end: o.end.toISOString() }))}
      safeSpots={safeSpots}
      customDays={customDayStarts().map((d) => d.toISOString())}
      emergencyContacts={emergencyContacts}
      now={new Date().toISOString()}
    />
  );
}
