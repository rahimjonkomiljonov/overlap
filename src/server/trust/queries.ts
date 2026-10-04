import type { PrismaClient } from "@/generated/prisma/client";
import { computeTrustScore, explainTrust, isReachLimited, NO_SIGNALS, type TrustReason } from "./score";
import { loadTrustSignals, type TrustSignalsDb } from "./signals";

export interface MyTrustStatus {
  limited: boolean;
  reasons: TrustReason[];
  restoredUntil: Date | null;
  openAppeal: { createdAt: Date } | null;
  lastDecision: { status: "ACCEPTED" | "REJECTED"; response: string | null; resolvedAt: Date | null } | null;
}

/** The signed-in user's own G10 status: whether reach is limited, why (counts only), and appeal state. */
export async function getMyTrustStatus(
  db: Pick<PrismaClient, "user" | "trustAppeal"> & TrustSignalsDb,
  userId: string,
  now: Date = new Date(),
): Promise<MyTrustStatus> {
  const [user, signals, appeals] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { reachRestoredUntil: true } }),
    loadTrustSignals(db, [userId], now),
    db.trustAppeal.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { status: true, response: true, createdAt: true, resolvedAt: true },
    }),
  ]);
  const mine = signals.get(userId) ?? NO_SIGNALS;
  const restoredUntil = user?.reachRestoredUntil ?? null;
  const open = appeals.find((a) => a.status === "OPEN");
  const decided = appeals.find((a) => a.status !== "OPEN");

  return {
    limited: isReachLimited(computeTrustScore(mine), restoredUntil, now),
    reasons: explainTrust(mine),
    restoredUntil: restoredUntil && restoredUntil > now ? restoredUntil : null,
    openAppeal: open ? { createdAt: open.createdAt } : null,
    lastDecision: decided
      ? { status: decided.status as "ACCEPTED" | "REJECTED", response: decided.response, resolvedAt: decided.resolvedAt }
      : null,
  };
}

export interface TrustAppealForReview {
  id: string;
  userId: string;
  firstName: string | null;
  note: string;
  createdAt: Date;
  score: number;
  reasons: TrustReason[];
}

/**
 * Open G10 appeals for moderators. Only the appeal note, the first name and the signal
 * counts: no profile sensitive fields (H4), and no report contents (those stay in /admin/reports).
 */
export async function getOpenTrustAppeals(
  db: Pick<PrismaClient, "trustAppeal"> & TrustSignalsDb,
  now: Date = new Date(),
): Promise<TrustAppealForReview[]> {
  const appeals = await db.trustAppeal.findMany({
    where: { status: "OPEN" },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: {
      id: true,
      userId: true,
      note: true,
      createdAt: true,
      user: { select: { profile: { select: { firstName: true } } } },
    },
  });
  const signals = await loadTrustSignals(
    db,
    appeals.map((a) => a.userId),
    now,
  );
  return appeals.map((a) => {
    const s = signals.get(a.userId) ?? NO_SIGNALS;
    return {
      id: a.id,
      userId: a.userId,
      firstName: a.user.profile?.firstName ?? null,
      note: a.note,
      createdAt: a.createdAt,
      score: computeTrustScore(s),
      reasons: explainTrust(s),
    };
  });
}
