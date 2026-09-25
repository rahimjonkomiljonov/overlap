import { ConsentType } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";

export type PrivacyOverviewDb = Pick<PrismaClient, "consent" | "dataRequest">;

/** The optional/sensitive types §15.3 lists as withdrawable — same list `withdrawConsentSchema` validates against. */
const WITHDRAWABLE_TYPES = [
  ConsentType.SENSITIVE_PREFERENCE,
  ConsentType.MARKETING,
  ConsentType.MARKETING_NIGHT,
  ConsentType.OVERSEAS_TRANSFER,
] as const;

export interface ConsentOverviewEntry {
  type: ConsentType;
  active: boolean;
  withdrawable: boolean;
  grantedAt: Date | null;
  withdrawnAt: Date | null;
}

export interface PrivacyOverview {
  consents: ConsentOverviewEntry[];
  dataRequests: { id: string; type: string; status: string; createdAt: Date; dueAt: Date; completedAt: Date | null }[];
}

/** For /me/privacy: the current (latest-wins) state of every consent type ever recorded, plus this user's request history (L2). */
export async function getMyPrivacyOverview(db: PrivacyOverviewDb, userId: string): Promise<PrivacyOverview> {
  const [allConsents, dataRequests] = await Promise.all([
    db.consent.findMany({
      where: { userId },
      orderBy: { grantedAt: "desc" },
      select: { type: true, granted: true, grantedAt: true, withdrawnAt: true },
    }),
    db.dataRequest.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, type: true, status: true, createdAt: true, dueAt: true, completedAt: true },
    }),
  ]);

  const latestByType = new Map<ConsentType, (typeof allConsents)[number]>();
  for (const consent of allConsents) {
    if (!latestByType.has(consent.type)) {
      latestByType.set(consent.type, consent);
    }
  }

  const consents: ConsentOverviewEntry[] = Object.values(ConsentType)
    .filter((type) => latestByType.has(type))
    .map((type) => {
      const latest = latestByType.get(type)!;
      return {
        type,
        active: latest.granted && latest.withdrawnAt === null,
        withdrawable: (WITHDRAWABLE_TYPES as readonly ConsentType[]).includes(type),
        grantedAt: latest.granted ? latest.grantedAt : null,
        withdrawnAt: latest.withdrawnAt,
      };
    });

  return { consents, dataRequests };
}
