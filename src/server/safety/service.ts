import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { UserStatus, type ReportCategory } from "@/generated/prisma/enums";
import { getConversationForActor, getMessages, type ChatDb } from "@/server/chat/queries";
import { buildEvidenceSnapshot, type EvidenceMessage } from "@/server/reports/evidence";
import { priorityForCategory } from "@/server/reports/priority";
import { getMyTrustStatus } from "@/server/trust/queries";
import type { TrustSignalsDb } from "@/server/trust/signals";
import { getMySafetySettings, type MySafetySettings } from "./queries";

export type SafetyWriteDb = Pick<PrismaClient, "user" | "block" | "hideRule" | "profile" | "profileCourse" | "profileClub" | "report" | "moderationAction" | "trustAppeal" | "$transaction"> &
  ChatDb;

// ---- block

export type BlockResult = { status: "blocked" } | { status: "error"; code: "CANNOT_BLOCK_SELF" | "NOT_FOUND" };

/** G2: block = mutual invisibility, created by either side, permanent unless undone. Shared by the website's `blockUser` action and the mobile route. */
export async function blockUserStep(
  db: Pick<PrismaClient, "user" | "block">,
  person: { userId: string },
  input: { targetUserId: string; reason?: string },
): Promise<BlockResult> {
  if (input.targetUserId === person.userId) return { status: "error", code: "CANNOT_BLOCK_SELF" };
  const target = await db.user.findUnique({ where: { id: input.targetUserId }, select: { id: true } });
  if (!target) return { status: "error", code: "NOT_FOUND" };

  await db.block.upsert({
    where: { blockerId_blockedId: { blockerId: person.userId, blockedId: input.targetUserId } },
    update: {},
    create: { blockerId: person.userId, blockedId: input.targetUserId, reason: input.reason ?? null },
  });
  return { status: "blocked" };
}

/** "Permanent unless undone" (G2) — this is the undo. Unblocking someone who was never blocked changes nothing. */
export async function unblockUserStep(db: Pick<PrismaClient, "block">, person: { userId: string }, targetUserId: string): Promise<{ status: "unblocked" }> {
  await db.block.deleteMany({ where: { blockerId: person.userId, blockedId: targetUserId } });
  return { status: "unblocked" };
}

// ---- visibility

export type ToggleResult = { status: "saved" } | { status: "error"; code: "ACCOUNT_RESTRICTED" };

/** G3 "pause profile": flips between ACTIVE and PAUSED only, never touching SUSPENDED or BANNED, so a restricted person cannot self-service their way back to visibility. */
export async function setPausedStep(
  db: Pick<PrismaClient, "user">,
  person: { userId: string; status: UserStatus },
  paused: boolean,
): Promise<ToggleResult> {
  if (person.status !== UserStatus.ACTIVE && person.status !== UserStatus.PAUSED) {
    return { status: "error", code: "ACCOUNT_RESTRICTED" };
  }
  await db.user.update({ where: { id: person.userId }, data: { status: paused ? UserStatus.PAUSED : UserStatus.ACTIVE } });
  return { status: "saved" };
}

/** G3 "incognito mode": browse and act normally, but never appear as a candidate to anyone else. */
export async function setIncognitoStep(db: Pick<PrismaClient, "profile">, person: { userId: string }, incognito: boolean): Promise<{ status: "saved" }> {
  await db.profile.update({ where: { userId: person.userId }, data: { incognito } });
  return { status: "saved" };
}

// ---- hide-from

async function hideAll(db: Pick<PrismaClient, "hideRule">, userId: string, hiddenUserIds: string[]): Promise<number> {
  if (hiddenUserIds.length === 0) return 0;
  const created = await db.hideRule.createMany({
    data: hiddenUserIds.map((hiddenUserId) => ({ userId, hiddenUserId })),
    skipDuplicates: true,
  });
  return created.count;
}

export type HideResult = { status: "hidden"; count: number } | { status: "error"; code: "NOT_FOUND" | "CANNOT_HIDE_SELF" };

/**
 * G3 hide-from. "Hide by course/club" resolves the course or club to every other person currently in it
 * and stores one rule per person, exactly like hiding someone individually (the rule is a way to find
 * who to hide, not a stored filter).
 */
export async function hideByCourseStep(db: Pick<PrismaClient, "profileCourse" | "hideRule">, person: { userId: string }, courseId: string): Promise<HideResult> {
  const others = await db.profileCourse.findMany({
    where: { courseId, profile: { userId: { not: person.userId } } },
    select: { profile: { select: { userId: true } } },
  });
  return { status: "hidden", count: await hideAll(db, person.userId, others.map((o) => o.profile.userId)) };
}

export async function hideByClubStep(db: Pick<PrismaClient, "profileClub" | "hideRule">, person: { userId: string }, clubId: string): Promise<HideResult> {
  const others = await db.profileClub.findMany({
    where: { clubId, profile: { userId: { not: person.userId } } },
    select: { profile: { select: { userId: true } } },
  });
  return { status: "hidden", count: await hideAll(db, person.userId, others.map((o) => o.profile.userId)) };
}

export async function hideByEmailStep(db: Pick<PrismaClient, "user" | "hideRule">, person: { userId: string }, email: string): Promise<HideResult> {
  const target = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (!target) return { status: "error", code: "NOT_FOUND" };
  if (target.id === person.userId) return { status: "error", code: "CANNOT_HIDE_SELF" };
  return { status: "hidden", count: await hideAll(db, person.userId, [target.id]) };
}

export async function unhideStep(db: Pick<PrismaClient, "hideRule">, person: { userId: string }, hiddenUserId: string): Promise<{ status: "unhidden" }> {
  await db.hideRule.deleteMany({ where: { userId: person.userId, hiddenUserId } });
  return { status: "unhidden" };
}

// ---- report

export type FileReportResult =
  | { status: "filed" }
  | { status: "error"; code: "CANNOT_REPORT_SELF" | "NOT_FOUND" | "INVALID_CONVERSATION" };

/**
 * User-facing 2-tap report (G1). Filed from an open chat, it snapshots up to the last 50 messages as
 * evidence, the only way a human ever sees chat content. Always hides the reported person from the
 * reporter immediately, in the same transaction, before any moderator decision (moderation playbook).
 * Shared by the website's `fileReport` action and the mobile `POST /reports` route.
 */
export async function fileReportStep(
  db: SafetyWriteDb,
  person: { userId: string },
  input: { targetUserId: string; category: ReportCategory; description?: string; conversationId?: string },
): Promise<FileReportResult> {
  const { targetUserId, category, description, conversationId } = input;
  if (targetUserId === person.userId) return { status: "error", code: "CANNOT_REPORT_SELF" };

  const target = await db.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
  if (!target) return { status: "error", code: "NOT_FOUND" };

  let evidence: EvidenceMessage[] | null = null;
  if (conversationId) {
    const conversation = await getConversationForActor(db, conversationId, person.userId);
    if (!conversation || conversation.otherUserId !== targetUserId) {
      return { status: "error", code: "INVALID_CONVERSATION" };
    }
    evidence = buildEvidenceSnapshot(await getMessages(db, conversationId));
  }

  await db.$transaction(async (tx) => {
    await tx.report.create({
      data: {
        reporterId: person.userId,
        targetId: targetUserId,
        conversationId: conversationId ?? null,
        category,
        priority: priorityForCategory(category),
        description: description ?? null,
        evidence: evidence ? (evidence as unknown as Prisma.InputJsonValue) : undefined,
      },
    });
    await tx.hideRule.upsert({
      where: { userId_hiddenUserId: { userId: person.userId, hiddenUserId: targetUserId } },
      update: {},
      create: { userId: person.userId, hiddenUserId: targetUserId },
    });
  });
  return { status: "filed" };
}

// ---- appeals

export type AppealResult = { status: "submitted" } | { status: "error"; code: "NOT_FOUND" | "ALREADY_APPEALED" };

/** The affected person's own one-time appeal on a moderation action taken against them (PIPA Art. 37-2). */
export async function submitAppealStep(
  db: Pick<PrismaClient, "moderationAction">,
  person: { userId: string },
  input: { moderationActionId: string; appealNote: string },
): Promise<AppealResult> {
  const action = await db.moderationAction.findUnique({
    where: { id: input.moderationActionId },
    select: { id: true, targetId: true, appealedAt: true },
  });
  if (!action || action.targetId !== person.userId) return { status: "error", code: "NOT_FOUND" };
  if (action.appealedAt) return { status: "error", code: "ALREADY_APPEALED" };

  await db.moderationAction.update({ where: { id: action.id }, data: { appealNote: input.appealNote, appealedAt: new Date() } });
  return { status: "submitted" };
}

export type TrustAppealResult = { status: "submitted" } | { status: "error"; code: "NOT_LIMITED" | "ALREADY_OPEN" };

/** G10: the affected person's appeal against their own reach limit. One open appeal at a time. */
export async function submitTrustAppealStep(
  db: Pick<PrismaClient, "user" | "trustAppeal"> & TrustSignalsDb,
  person: { userId: string },
  note: string,
): Promise<TrustAppealResult> {
  const status = await getMyTrustStatus(db, person.userId);
  if (!status.limited) return { status: "error", code: "NOT_LIMITED" };
  if (status.openAppeal) return { status: "error", code: "ALREADY_OPEN" };

  await db.trustAppeal.create({ data: { userId: person.userId, note } });
  return { status: "submitted" };
}

// ---- the whole safety screen

export type SafetyScreenDb = Pick<PrismaClient, "user" | "block" | "hideRule" | "moderationAction" | "trustAppeal" | "profileCourse" | "profileClub"> & TrustSignalsDb;

export interface SafetyScreen {
  status: UserStatus;
  suspendedUntil: Date | null;
  settings: MySafetySettings;
  /** Courses and clubs on the person's own profile: what "hide from a group" can pick from. */
  courses: { id: string; code: string; title: string }[];
  clubs: { id: string; name: string }[];
  actions: { id: string; type: string; reason: string; createdAt: Date; appealNote: string | null; appealedAt: Date | null }[];
  trust: Awaited<ReturnType<typeof getMyTrustStatus>>;
}

/** Everything the safety screen shows, in one call: the mobile counterpart of the website's /me/safety page. */
export async function getSafetyScreen(db: SafetyScreenDb, person: { userId: string }): Promise<SafetyScreen> {
  const [account, settings, courses, clubs, actions, trust] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: person.userId }, select: { status: true, suspendedUntil: true } }),
    getMySafetySettings(db, person.userId),
    db.profileCourse.findMany({ where: { profile: { userId: person.userId } }, select: { course: { select: { id: true, code: true, title: true } } } }),
    db.profileClub.findMany({ where: { profile: { userId: person.userId } }, select: { club: { select: { id: true, name: true } } } }),
    db.moderationAction.findMany({
      where: { targetId: person.userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, type: true, reason: true, createdAt: true, appealNote: true, appealedAt: true },
    }),
    getMyTrustStatus(db, person.userId),
  ]);
  return {
    status: account.status,
    suspendedUntil: account.suspendedUntil,
    settings,
    courses: courses.map((c) => c.course),
    clubs: clubs.map((c) => c.club),
    actions,
    trust,
  };
}
