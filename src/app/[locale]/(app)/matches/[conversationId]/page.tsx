import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChatThread } from "@/components/chat/chat-thread";
import { redirect } from "@/i18n/navigation";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getConversationForActor, getMessages } from "@/server/chat/queries";
import { getIcebreakerReasons } from "@/server/chat/icebreakers";
import { buildLabelMaps, resolveReasons, type ResolvedReason } from "@/server/picks/reasons";
import { getEmergencyContacts } from "@/server/safety/emergency";

export default async function ChatPage({
  params,
}: PageProps<"/[locale]/matches/[conversationId]">) {
  const { locale, conversationId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Chat");

  // The (app) layout already redirects signed-out/not-yet-onboarded visitors, so an
  // actor always exists here.
  const actor = await getActor();
  const conversation = actor ? await getConversationForActor(prisma, conversationId, actor.userId) : null;
  if (!actor || !conversation) {
    redirect({ href: "/matches", locale });
    return;
  }

  const messages = await getMessages(prisma, conversationId);
  const emergencyContacts = actor.campusId ? await getEmergencyContacts(prisma, actor.campusId) : [];

  let icebreakers: string[] = [];
  if (messages.length === 0) {
    const reasons = await getIcebreakerReasons(prisma, conversationId);
    if (reasons.length > 0) {
      const maps = await buildLabelMaps(prisma, [reasons]);
      const tFreeTime = await getTranslations("ProfileOnboarding.freeTime");
      const days = tFreeTime.raw("days") as string[];
      const blocks = tFreeTime.raw("blocks") as string[];
      icebreakers = resolveReasons(reasons, maps, locale)
        .map((reason) => renderIcebreaker(reason, t, days, blocks))
        .filter((s): s is string => s !== null);
    }
    if (icebreakers.length === 0) {
      icebreakers = [t("icebreakerGeneric1"), t("icebreakerGeneric2"), t("icebreakerGeneric3")];
    }
  }

  return (
    <ChatThread
      conversationId={conversationId}
      matchId={conversation.matchId}
      actorUserId={actor.userId}
      otherUserId={conversation.otherUserId}
      otherFirstName={conversation.otherFirstName}
      otherPhotoUrl={conversation.otherPhotoUrl}
      initialMessages={messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))}
      initialStatus={conversation.status}
      matchStatus={conversation.matchStatus}
      revivedAt={conversation.revivedAt?.toISOString() ?? null}
      icebreakers={icebreakers}
      emergencyContacts={emergencyContacts}
    />
  );
}

function renderIcebreaker(
  reason: ResolvedReason,
  t: Awaited<ReturnType<typeof getTranslations<"Chat">>>,
  days: string[],
  blocks: string[],
): string | null {
  switch (reason.type) {
    case "course":
      return t("icebreaker_course", { label: reason.label });
    case "club":
      return t("icebreaker_club", { label: reason.label });
    case "interest":
      return t("icebreaker_interest", { label: reason.label });
    case "freeTime":
      return t("icebreaker_freeTime", { day: days[reason.day], block: blocks[reason.block] });
    case "values":
      return t("icebreaker_values");
  }
}
