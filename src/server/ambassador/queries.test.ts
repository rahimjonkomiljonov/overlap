import { describe, expect, it, vi } from "vitest";
import { Gender } from "@/generated/prisma/enums";
import { getAmbassadorDashboard, type AmbassadorDb } from "./queries";

const NOW = new Date("2026-10-05T00:00:00Z");

function fakeDb(cohortGenders: Gender[]) {
  const count = vi.fn(async () => 3);
  const findMany = vi.fn(async (args: { where: Record<string, unknown> }) =>
    // computeCohortDensity's query (by cohortId) vs. nothing else here.
    args.where.cohortId ? cohortGenders.map((gender) => ({ profile: { gender } })) : [],
  );
  const db = {
    inviteCode: {
      findMany: vi.fn(async () => [
        {
          code: "AAAA2222",
          useCount: 2,
          maxUses: 5,
          expiresAt: null,
          cohort: { id: "c1", name: "Ambassadors 1", datingOpen: false },
        },
        {
          code: "BBBB3333",
          useCount: 1,
          maxUses: 1,
          expiresAt: new Date("2026-10-01T00:00:00Z"),
          cohort: { id: "c1", name: "Ambassadors 1", datingOpen: false },
        },
      ]),
    },
    user: { count, findMany },
    referral: { count: vi.fn(async () => 4) },
  } as unknown as AmbassadorDb;
  return { db, count };
}

describe("getAmbassadorDashboard", () => {
  it("scopes every invitee count to codes the ambassador owns", async () => {
    const { db, count } = fakeDb([]);
    await getAmbassadorDashboard(db, "amb", NOW);
    for (const call of count.mock.calls as unknown as [{ where: { inviteCode: { ownerId: string } } }][]) {
      expect(call[0].where.inviteCode).toEqual({ ownerId: "amb" });
    }
  });

  it("marks expired codes and lists each cohort once", async () => {
    const { db } = fakeDb([]);
    const dashboard = await getAmbassadorDashboard(db, "amb", NOW);
    expect(dashboard.codes.map((c) => c.expired)).toEqual([false, true]);
    expect(dashboard.cohorts).toHaveLength(1);
  });

  it("hides gender shares for a cohort smaller than the minimum", async () => {
    const small = await getAmbassadorDashboard(fakeDb([Gender.WOMAN, Gender.MAN]).db, "amb", NOW);
    expect(small.cohorts[0]).toMatchObject({ eligible: 2, womenShare: null, menShare: null });

    const ten = Array.from({ length: 10 }, (_, i) => (i < 4 ? Gender.WOMAN : Gender.MAN));
    const big = await getAmbassadorDashboard(fakeDb(ten).db, "amb", NOW);
    expect(big.cohorts[0].womenShare).toBeCloseTo(0.4, 10);
    expect(big.cohorts[0].menShare).toBeCloseTo(0.6, 10);
  });
});
