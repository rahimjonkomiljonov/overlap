import { afterEach, describe, expect, it, vi } from "vitest";
import { Gender } from "@/generated/prisma/enums";
import {
  DENSITY_GATE,
  generateInviteCode,
  getDatingStatus,
  isCohortReleaseEnabled,
  normalizeInviteCode,
  redeemInviteCode,
  summarizeDensity,
  type DatingStatusDb,
} from "./release";

afterEach(() => vi.unstubAllEnvs());

describe("isCohortReleaseEnabled", () => {
  it("is off unless COHORT_RELEASE is exactly 'on'", () => {
    vi.stubEnv("COHORT_RELEASE", "");
    expect(isCohortReleaseEnabled()).toBe(false);
    vi.stubEnv("COHORT_RELEASE", "true");
    expect(isCohortReleaseEnabled()).toBe(false);
    vi.stubEnv("COHORT_RELEASE", "on");
    expect(isCohortReleaseEnabled()).toBe(true);
  });
});

describe("invite codes", () => {
  it("normalizes case, spaces and dashes", () => {
    expect(normalizeInviteCode(" ab-cd ef12 ")).toBe("ABCDEF12");
  });

  it("generates readable codes without look-alike characters", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateInviteCode();
      expect(code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    }
  });
});

function fakeTx(rows: { id?: string; cohortId: string }[]) {
  const queryRaw = vi.fn(async () => rows);
  const update = vi.fn(async () => ({}));
  return { tx: { $queryRaw: queryRaw, user: { update } } as never, queryRaw, update };
}

describe("redeemInviteCode", () => {
  it("assigns the cohort the atomic update returned", async () => {
    const { tx, update } = fakeTx([{ id: "code-1", cohortId: "cohort-1" }]);
    const ok = await redeemInviteCode(tx, { userId: "u1", campusId: "c1", code: "ab-cd" });
    expect(ok).toBe(true);
    expect(update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { cohortId: "cohort-1", inviteCodeId: "code-1" },
    });
  });

  it("refuses an unknown, used-up, expired or other-campus code without touching the user", async () => {
    const { tx, update } = fakeTx([]);
    const ok = await redeemInviteCode(tx, { userId: "u1", campusId: "c1", code: "NOPE" });
    expect(ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("checks use count, expiry and campus inside the one update statement", async () => {
    const { tx, queryRaw } = fakeTx([]);
    await redeemInviteCode(tx, { userId: "u1", campusId: "c1", code: "x" });
    const sql = (queryRaw.mock.calls[0] as unknown as [TemplateStringsArray])[0].join("?");
    expect(sql).toContain('"useCount" < "maxUses"');
    expect(sql).toContain('"expiresAt" IS NULL OR "expiresAt" >');
    expect(sql).toContain('"campusId" =');
  });
});

function statusDb(opts: { consent: boolean; datingOpen?: boolean | null }): DatingStatusDb {
  return {
    consent: {
      findFirst: async () =>
        opts.consent ? { granted: true, withdrawnAt: null } : { granted: false, withdrawnAt: null },
    },
    user: {
      findUnique: async () => ({
        cohort: opts.datingOpen == null ? null : { datingOpen: opts.datingOpen },
      }),
    },
  } as unknown as DatingStatusDb;
}

describe("getDatingStatus", () => {
  it("needs consent first, whatever the cohort", async () => {
    expect(
      await getDatingStatus(statusDb({ consent: false, datingOpen: true }), "u", {
        cohortRelease: true,
      }),
    ).toBe("needs_consent");
  });

  it("ignores cohorts entirely when cohort release is off", async () => {
    expect(
      await getDatingStatus(statusDb({ consent: true, datingOpen: null }), "u", {
        cohortRelease: false,
      }),
    ).toBe("available");
  });

  it("is closed until the user's cohort opens Dating", async () => {
    expect(
      await getDatingStatus(statusDb({ consent: true, datingOpen: false }), "u", {
        cohortRelease: true,
      }),
    ).toBe("cohort_closed");
    expect(
      await getDatingStatus(statusDb({ consent: true, datingOpen: null }), "u", {
        cohortRelease: true,
      }),
    ).toBe("cohort_closed");
    expect(
      await getDatingStatus(statusDb({ consent: true, datingOpen: true }), "u", {
        cohortRelease: true,
      }),
    ).toBe("available");
  });
});

describe("summarizeDensity (density gate)", () => {
  const pool = (women: number, men: number, other = 0) => [
    ...Array<Gender>(women).fill(Gender.WOMAN),
    ...Array<Gender>(men).fill(Gender.MAN),
    ...Array<Gender | null>(other).fill(null),
  ];

  it(`passes at ${DENSITY_GATE.minEligibleUsers} eligible users with a balanced split`, () => {
    expect(summarizeDensity(pool(75, 75)).passes).toBe(true);
  });

  it("fails below the minimum pool size", () => {
    expect(summarizeDensity(pool(74, 75)).passes).toBe(false);
  });

  it("fails when women or men are under 35% of the pool", () => {
    expect(summarizeDensity(pool(50, 110)).passes).toBe(false); // women 31%
    expect(summarizeDensity(pool(110, 50)).passes).toBe(false); // men 31%
    expect(summarizeDensity(pool(56, 104)).passes).toBe(true); // women exactly 35%
  });

  it("counts people with other or no gender in the pool without failing the gate on them", () => {
    const d = summarizeDensity(pool(70, 70, 20));
    expect(d.other).toBe(20);
    expect(d.passes).toBe(true);
  });

  it("handles an empty cohort", () => {
    expect(summarizeDensity([])).toMatchObject({ eligible: 0, womenShare: 0, passes: false });
  });
});
