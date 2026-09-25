import type { PrismaClient } from "@/generated/prisma/client";
import { decryptField } from "@/server/privacy/encryption";

export type ExportDb = Pick<PrismaClient, "user">;

/**
 * L2's "view/download my data" — a single nested `user.findUnique` (not one query per
 * model) so every row returned is structurally reachable only via *this* user's own id;
 * there is no join or filter condition elsewhere in this function that a mistake could
 * widen to include another user's row. Deliberately excludes anything authored by, or
 * identifying, anyone else: `wavesReceived`/`matchesAs*` omit the counterpart's user id
 * entirely, and `messagesSent` (never `messagesReceived` — there is no such relation)
 * only ever returns text this user themselves wrote (CLAUDE.md: chat text is
 * confidential communication, and someone else's words aren't this user's data to
 * export). `Profile.interestedIn` is decrypted back to plain text here — an access
 * request is exactly the one context where the owner is entitled to see their own
 * sensitive field in the clear.
 */
export async function buildUserDataExport(db: ExportDb, userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      birthYear: true,
      ageVerifiedAt: true,
      status: true,
      createdAt: true,
      profile: {
        select: {
          firstName: true,
          gender: true,
          pronouns: true,
          year: true,
          major: true,
          intents: true,
          interestedIn: true,
          freeTimeSlots: true,
          valuesAnswers: true,
          interestsFreeText: true,
          incognito: true,
          completedAt: true,
          createdAt: true,
          courses: { select: { createdAt: true, course: { select: { code: true, term: true } } } },
          clubs: { select: { createdAt: true, club: { select: { name: true } } } },
          spots: { select: { createdAt: true, spot: { select: { name: true } } } },
          interests: { select: { interestTag: { select: { labelKo: true, labelEn: true } } } },
          promptAnswers: {
            select: { answer: true, sortOrder: true, prompt: { select: { textKo: true, textEn: true } } },
          },
          photos: { select: { sortOrder: true, width: true, height: true, createdAt: true } },
        },
      },
      consents: {
        select: { type: true, granted: true, policyVersion: true, grantedAt: true, withdrawnAt: true, source: true },
      },
      wavesSent: { select: { targetElement: true, note: true, status: true, createdAt: true } },
      wavesReceived: { select: { targetElement: true, note: true, status: true, createdAt: true } },
      matchesAsUserA: { select: { status: true, createdAt: true, unmatchedAt: true } },
      matchesAsUserB: { select: { status: true, createdAt: true, unmatchedAt: true } },
      messagesSent: { select: { conversationId: true, text: true, createdAt: true } },
      reportsFiled: {
        select: { category: true, status: true, description: true, createdAt: true, resolvedAt: true },
      },
      notifications: { select: { type: true, status: true, createdAt: true, sentAt: true } },
      dataRequests: { select: { type: true, status: true, createdAt: true, dueAt: true, completedAt: true } },
      meetProposalsMade: {
        select: { day: true, block: true, scheduledStart: true, scheduledEnd: true, status: true, createdAt: true },
      },
    },
  });

  if (!user) return null;

  return {
    exportedAt: new Date().toISOString(),
    account: {
      email: user.email,
      name: user.name,
      birthYear: user.birthYear,
      ageVerifiedAt: user.ageVerifiedAt,
      status: user.status,
      createdAt: user.createdAt,
    },
    profile: user.profile && {
      ...user.profile,
      interestedIn: user.profile.interestedIn ? decryptField(user.profile.interestedIn) : null,
    },
    consents: user.consents,
    wavesSent: user.wavesSent,
    wavesReceived: user.wavesReceived,
    matches: [...user.matchesAsUserA, ...user.matchesAsUserB],
    messagesSent: user.messagesSent,
    reportsFiled: user.reportsFiled,
    notifications: user.notifications,
    meetProposalsMade: user.meetProposalsMade,
    dataRequests: user.dataRequests,
  };
}
