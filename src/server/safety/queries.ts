import type { PrismaClient } from "@/generated/prisma/client";
import { UserStatus } from "@/generated/prisma/enums";

export type SafetySettingsDb = Pick<PrismaClient, "user" | "block" | "hideRule">;

export interface SafetyListEntry {
  userId: string;
  name: string;
}

export interface MySafetySettings {
  paused: boolean;
  incognito: boolean;
  blocked: SafetyListEntry[];
  hidden: SafetyListEntry[];
}

/** I3: "blocked list," pause and hide-from state for the owner's own /me/safety settings page. */
export async function getMySafetySettings(db: SafetySettingsDb, userId: string): Promise<MySafetySettings> {
  const [user, blocks, hideRules] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { status: true, profile: { select: { incognito: true } } },
    }),
    db.block.findMany({
      where: { blockerId: userId },
      orderBy: { createdAt: "desc" },
      select: { blockedId: true, blocked: { select: { name: true } } },
    }),
    db.hideRule.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { hiddenUserId: true, hiddenUser: { select: { name: true } } },
    }),
  ]);

  return {
    paused: user.status === UserStatus.PAUSED,
    incognito: user.profile?.incognito ?? false,
    blocked: blocks.map((b) => ({ userId: b.blockedId, name: b.blocked.name })),
    hidden: hideRules.map((h) => ({ userId: h.hiddenUserId, name: h.hiddenUser.name })),
  };
}
