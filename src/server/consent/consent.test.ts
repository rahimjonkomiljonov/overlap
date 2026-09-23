import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { ConsentType } from "@/generated/prisma/enums";
import { canUseDatingMode, getLatestConsent, POLICY_VERSION, recordConsent } from "./consent";
import type { ConsentDb } from "./consent";

type FakeRow = {
  id: string;
  userId: string;
  type: ConsentType;
  granted: boolean;
  policyVersion: string;
  grantedAt: Date;
};

type CreateArgs = {
  data: {
    userId: string;
    type: ConsentType;
    granted: boolean;
    policyVersion: string;
    source: string;
  };
};
type FindFirstArgs = { where: { userId: string; type: ConsentType } };

/**
 * A minimal in-memory fake standing in for the two Prisma methods this module
 * actually calls (create, findFirst sorted by grantedAt desc) — same
 * dependency-injection pattern as src/server/auth/rate-limit.ts. `rows` is exposed
 * directly for test assertions that need "everything recorded", which the real
 * ConsentDb interface (deliberately narrow) doesn't provide.
 */
function fakeConsentDb(): { db: ConsentDb; rows: FakeRow[] } {
  const rows: FakeRow[] = [];

  const db = {
    consent: {
      create: (async ({ data }: CreateArgs) => {
        const row: FakeRow = {
          id: randomUUID(),
          userId: data.userId,
          type: data.type,
          granted: data.granted,
          policyVersion: data.policyVersion,
          grantedAt: new Date(Date.now() + rows.length), // strictly increasing, even in fast tests
        };
        rows.push(row);
        return row;
      }) as unknown as ConsentDb["consent"]["create"],
      findFirst: (async ({ where }: FindFirstArgs) => {
        const matches = rows
          .filter((r) => r.userId === where.userId && r.type === where.type)
          .sort((a, b) => b.grantedAt.getTime() - a.grantedAt.getTime());
        return matches[0] ?? null;
      }) as unknown as ConsentDb["consent"]["findFirst"],
    },
  } as ConsentDb;

  return { db, rows };
}

describe("consent ledger", () => {
  let db: ConsentDb;
  let rows: FakeRow[];
  const userId = "user-1";

  beforeEach(() => {
    ({ db, rows } = fakeConsentDb());
  });

  it("records a new row rather than updating in place (append-only)", async () => {
    await recordConsent(db, {
      userId,
      type: ConsentType.TERMS,
      granted: true,
      source: "onboarding",
    });
    await recordConsent(db, {
      userId,
      type: ConsentType.TERMS,
      granted: true,
      source: "onboarding",
    });
    expect(rows).toHaveLength(2);
  });

  it("versions each record with the policy version at the time, so old and new copies coexist", async () => {
    await recordConsent(db, {
      userId,
      type: ConsentType.TERMS,
      granted: true,
      source: "onboarding",
      policyVersion: "2026-01-01",
    });
    await recordConsent(db, {
      userId,
      type: ConsentType.TERMS,
      granted: true,
      source: "settings/privacy",
      policyVersion: "2026-06-01",
    });
    expect(rows.map((r) => r.policyVersion).sort()).toEqual(["2026-01-01", "2026-06-01"]);
  });

  it("defaults to the current POLICY_VERSION when none is given", async () => {
    await recordConsent(db, {
      userId,
      type: ConsentType.TERMS,
      granted: true,
      source: "onboarding",
    });
    const latest = await getLatestConsent(db, userId, ConsentType.TERMS);
    expect(latest?.policyVersion).toBe(POLICY_VERSION);
  });

  it("records an explicit decline, not just grants", async () => {
    await recordConsent(db, {
      userId,
      type: ConsentType.SENSITIVE_PREFERENCE,
      granted: false,
      source: "onboarding",
    });
    const latest = await getLatestConsent(db, userId, ConsentType.SENSITIVE_PREFERENCE);
    expect(latest).toMatchObject({ granted: false });
  });

  it("getLatestConsent returns the most recent record, not the first", async () => {
    await recordConsent(db, {
      userId,
      type: ConsentType.SENSITIVE_PREFERENCE,
      granted: false,
      source: "onboarding",
    });
    await recordConsent(db, {
      userId,
      type: ConsentType.SENSITIVE_PREFERENCE,
      granted: true,
      source: "settings/privacy",
    });
    const latest = await getLatestConsent(db, userId, ConsentType.SENSITIVE_PREFERENCE);
    expect(latest?.granted).toBe(true);
  });

  describe("canUseDatingMode", () => {
    it("is false when the sensitive preference was never recorded", async () => {
      expect(await canUseDatingMode(db, userId)).toBe(false);
    });

    it("is false right after declining", async () => {
      await recordConsent(db, {
        userId,
        type: ConsentType.SENSITIVE_PREFERENCE,
        granted: false,
        source: "onboarding",
      });
      expect(await canUseDatingMode(db, userId)).toBe(false);
    });

    it("is true once granted", async () => {
      await recordConsent(db, {
        userId,
        type: ConsentType.SENSITIVE_PREFERENCE,
        granted: true,
        source: "onboarding",
      });
      expect(await canUseDatingMode(db, userId)).toBe(true);
    });

    it("follows the latest record when someone declines, then later opts in", async () => {
      await recordConsent(db, {
        userId,
        type: ConsentType.SENSITIVE_PREFERENCE,
        granted: false,
        source: "onboarding",
      });
      await recordConsent(db, {
        userId,
        type: ConsentType.SENSITIVE_PREFERENCE,
        granted: true,
        source: "settings/privacy",
      });
      expect(await canUseDatingMode(db, userId)).toBe(true);
    });

    it("does not leak another user's consent", async () => {
      await recordConsent(db, {
        userId: "someone-else",
        type: ConsentType.SENSITIVE_PREFERENCE,
        granted: true,
        source: "onboarding",
      });
      expect(await canUseDatingMode(db, userId)).toBe(false);
    });
  });
});
