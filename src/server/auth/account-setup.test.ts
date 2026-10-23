import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { ConsentType } from "@/generated/prisma/enums";
import { completeAccountSetup, type AccountSetupInput } from "./account-setup";
import type { AgeVerifier } from "./age-verifier";

const VERIFIED_AT = new Date("2026-10-24T12:00:00Z");
const input: AccountSetupInput = {
  userId: "user-a",
  birthYear: 2000,
  birthMonth: 5,
  birthDay: 17,
  attestedAdult: true,
  sensitiveGranted: false,
  source: "mobile-onboarding",
};

/** A verifier that says yes, or no for a given reason. */
const verifier = (
  answer:
    | { eligible: true }
    | {
        eligible: false;
        reason: "TOO_YOUNG" | "INVALID_DATE" | "IMPLAUSIBLE_YEAR" | "NOT_ATTESTED";
      } = { eligible: true },
) =>
  ({
    track: "B",
    verify: vi.fn(() => (answer.eligible ? { eligible: true, verifiedAt: VERIFIED_AT } : answer)),
  }) as unknown as AgeVerifier;

function fakeDb({
  email = "kim@gachon.ac.kr",
  domains = ["gachon.ac.kr"],
  codeIsValid = true,
  datingOpen = false,
} = {}) {
  const consents: {
    userId: string;
    type: ConsentType;
    granted: boolean;
    source: string;
    withdrawnAt: null;
  }[] = [];
  const userUpdates: { where: { id: string }; data: Record<string, unknown> }[] = [];
  const redeemCalls: unknown[][] = [];
  const tx = {
    user: {
      update: vi.fn(
        async (args: { where: { id: string }; data: Record<string, unknown> }) =>
          void userUpdates.push(args),
      ),
    },
    consent: {
      create: vi.fn(
        async ({
          data,
        }: {
          data: { userId: string; type: ConsentType; granted: boolean; source: string };
        }) => void consents.push({ ...data, withdrawnAt: null }), // a real row starts un-withdrawn
      ),
    },
    $queryRaw: vi.fn(async (...args: unknown[]) => {
      redeemCalls.push(args);
      return codeIsValid ? [{ id: "ic1", cohortId: "co1" }] : [];
    }),
  };
  const db = {
    user: {
      findUniqueOrThrow: vi.fn(async () => ({ email })),
      findUnique: vi.fn(async () => ({ cohort: { datingOpen } })),
    },
    emailDomain: {
      findUnique: vi.fn(async ({ where }: { where: { domain: string } }) =>
        domains.includes(where.domain)
          ? { domain: where.domain, campus: { id: "campus-1", name: "Gachon" } }
          : null,
      ),
    },
    consent: {
      findFirst: vi.fn(
        async ({ where }: { where: { type: ConsentType } }) =>
          [...consents].reverse().find((c) => c.type === where.type) ?? null,
      ),
    },
    $transaction: vi.fn(async (callback: (t: typeof tx) => Promise<unknown>) => callback(tx)),
  } as unknown as PrismaClient;
  return { db, tx, consents, userUpdates, redeemCalls };
}

describe("completeAccountSetup", () => {
  it("declining the sensitive consent still sets the account up, with the decline recorded and Dating off", async () => {
    const f = fakeDb();
    const result = await completeAccountSetup(
      { db: f.db, verifier: verifier(), cohortRelease: false },
      { ...input, sensitiveGranted: false },
    );
    expect(result).toEqual({ status: "complete", datingAvailable: false });
    expect(f.userUpdates).toEqual([
      {
        where: { id: "user-a" },
        data: { campusId: "campus-1", birthYear: 2000, ageVerifiedAt: VERIFIED_AT },
      },
    ]);
    expect(f.consents.map((c) => [c.type, c.granted])).toEqual([
      [ConsentType.TERMS, true],
      [ConsentType.PRIVACY_POLICY, true],
      [ConsentType.SENSITIVE_PREFERENCE, false],
    ]);
  });

  it("accepting the sensitive consent turns Dating on (when no cohort gate applies)", async () => {
    const f = fakeDb();
    const result = await completeAccountSetup(
      { db: f.db, verifier: verifier(), cohortRelease: false },
      { ...input, sensitiveGranted: true },
    );
    expect(result).toEqual({ status: "complete", datingAvailable: true });
    expect(f.consents.find((c) => c.type === ConsentType.SENSITIVE_PREFERENCE)?.granted).toBe(true);
  });

  it("stores only the birth year, never the month or day", async () => {
    const f = fakeDb();
    await completeAccountSetup({ db: f.db, verifier: verifier(), cohortRelease: false }, input);
    const written = JSON.stringify([f.userUpdates, f.consents]);
    expect(written).not.toContain("birthMonth");
    expect(written).not.toContain("birthDay");
    expect(Object.keys(f.userUpdates[0].data).sort()).toEqual([
      "ageVerifiedAt",
      "birthYear",
      "campusId",
    ]);
  });

  it("records where the consent was given", async () => {
    const f = fakeDb();
    await completeAccountSetup(
      { db: f.db, verifier: verifier(), cohortRelease: false },
      { ...input, source: "onboarding" },
    );
    expect(new Set(f.consents.map((c) => c.source))).toEqual(new Set(["onboarding"]));
  });

  it("changes nothing when the person is too young, or the date is invalid", async () => {
    for (const reason of [
      "TOO_YOUNG",
      "INVALID_DATE",
      "IMPLAUSIBLE_YEAR",
      "NOT_ATTESTED",
    ] as const) {
      const f = fakeDb();
      const result = await completeAccountSetup(
        { db: f.db, verifier: verifier({ eligible: false, reason }), cohortRelease: false },
        input,
      );
      expect(result).toEqual({ status: "error", code: reason });
      expect(f.db.$transaction).not.toHaveBeenCalled();
      expect(f.consents).toHaveLength(0);
    }
  });

  it("refuses an address that is not on a school domain, even though sign-in should have caught it", async () => {
    const f = fakeDb({ email: "someone@gmail.com" });
    const result = await completeAccountSetup(
      { db: f.db, verifier: verifier(), cohortRelease: false },
      input,
    );
    expect(result).toEqual({ status: "error", code: "INVALID_DOMAIN" });
    expect(f.db.$transaction).not.toHaveBeenCalled();
  });

  describe("with cohort release on", () => {
    it("requires an invite code, and records nothing without one", async () => {
      const f = fakeDb();
      const result = await completeAccountSetup(
        { db: f.db, verifier: verifier(), cohortRelease: true },
        input,
      );
      expect(result).toEqual({ status: "error", code: "INVALID_INVITE" });
      expect(f.db.$transaction).not.toHaveBeenCalled();
    });

    it("a bad code leaves the account exactly as it was: no consent, no campus", async () => {
      const f = fakeDb({ codeIsValid: false });
      const result = await completeAccountSetup(
        { db: f.db, verifier: verifier(), cohortRelease: true },
        { ...input, inviteCode: "WRONG123" },
      );
      expect(result).toEqual({ status: "error", code: "INVALID_INVITE" });
      expect(f.userUpdates).toHaveLength(0);
      expect(f.consents).toHaveLength(0);
    });

    it("a good code is used in the same step and the account is set up; Dating stays closed until the cohort opens it", async () => {
      const f = fakeDb({ codeIsValid: true, datingOpen: false });
      const result = await completeAccountSetup(
        { db: f.db, verifier: verifier(), cohortRelease: true },
        { ...input, inviteCode: "GOOD1234", sensitiveGranted: true },
      );
      expect(result).toEqual({ status: "complete", datingAvailable: false });
      expect(f.redeemCalls).toHaveLength(1);
      expect(f.userUpdates.at(-1)?.data).toMatchObject({ campusId: "campus-1" });
    });

    it("with consent given and the cohort's Dating open, Dating is available", async () => {
      const f = fakeDb({ datingOpen: true });
      const result = await completeAccountSetup(
        { db: f.db, verifier: verifier(), cohortRelease: true },
        { ...input, inviteCode: "GOOD1234", sensitiveGranted: true },
      );
      expect(result).toEqual({ status: "complete", datingAvailable: true });
    });
  });

  it("lets an unexpected database failure surface instead of pretending it worked", async () => {
    const f = fakeDb();
    (f.db.$transaction as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("db down"));
    await expect(
      completeAccountSetup({ db: f.db, verifier: verifier(), cohortRelease: false }, input),
    ).rejects.toThrow("db down");
  });
});
