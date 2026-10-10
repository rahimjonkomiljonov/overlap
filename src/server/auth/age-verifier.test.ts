import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getActiveAgeVerifier, type AgeVerificationInput } from "./age-verifier";

// 2026-09-23 12:00 Seoul time (03:00 UTC).
const NOW = new Date("2026-09-23T03:00:00Z");

function verify(
  input: Partial<AgeVerificationInput> & Pick<AgeVerificationInput, "birthYear">,
  now: Date = NOW,
) {
  return getActiveAgeVerifier().verify({ birthMonth: 6, birthDay: 15, attestedAdult: true, ...input }, now);
}

describe("Track B age verifier (default)", () => {
  beforeEach(() => {
    delete process.env.AGE_VERIFICATION_TRACK;
  });

  it("accepts someone clearly older", () => {
    expect(getActiveAgeVerifier().track).toBe("B");
    expect(verify({ birthYear: 1990 }).eligible).toBe(true);
  });

  it("accepts someone whose 19th birthday was earlier this year", () => {
    expect(verify({ birthYear: 2007, birthMonth: 3, birthDay: 1 }).eligible).toBe(true);
  });

  it("blocks someone who turns 19 later this year, even if they attest", () => {
    // Fine under the Youth Protection Act's birth-year rule, not under the Civil Act's:
    // the stricter rule applies.
    expect(verify({ birthYear: 2007, birthMonth: 12, birthDay: 31 })).toEqual({
      eligible: false,
      reason: "TOO_YOUNG",
    });
  });

  it("is exact on the 19th birthday: the day before is blocked, the day itself is allowed", () => {
    // NOW is 23 Sep 2026, so a 23 Sep 2007 birth turns 19 today.
    expect(verify({ birthYear: 2007, birthMonth: 9, birthDay: 24 })).toEqual({
      eligible: false,
      reason: "TOO_YOUNG",
    });
    expect(verify({ birthYear: 2007, birthMonth: 9, birthDay: 23 }).eligible).toBe(true);
    expect(verify({ birthYear: 2007, birthMonth: 9, birthDay: 22 }).eligible).toBe(true);
  });

  it("blocks a clearly underage birth year", () => {
    expect(verify({ birthYear: 2015 })).toEqual({ eligible: false, reason: "TOO_YOUNG" });
  });

  it("blocks a plausible adult birth date without the attestation checked", () => {
    expect(verify({ birthYear: 1990, attestedAdult: false })).toEqual({
      eligible: false,
      reason: "NOT_ATTESTED",
    });
  });

  it("uses the Seoul calendar day, not the server's UTC day", () => {
    // 22 Sep 2026 20:00 UTC is already 23 Sep 05:00 in Seoul.
    const lateUtc = new Date("2026-09-22T20:00:00Z");
    expect(verify({ birthYear: 2007, birthMonth: 9, birthDay: 23 }, lateUtc).eligible).toBe(true);
    // 23 Sep 2026 00:00 UTC is 09:00 in Seoul on the same day. Still the 23rd.
    expect(verify({ birthYear: 2007, birthMonth: 9, birthDay: 24 }, new Date("2026-09-23T00:00:00Z"))).toEqual({
      eligible: false,
      reason: "TOO_YOUNG",
    });
  });

  it("treats a 29 February birthday as 1 March in a non-leap 19th year", () => {
    // Born 29 Feb 2008: the 19th year is 2027, not a leap year.
    expect(verify({ birthYear: 2008, birthMonth: 2, birthDay: 29 }, new Date("2027-02-28T03:00:00Z"))).toEqual({
      eligible: false,
      reason: "TOO_YOUNG",
    });
    expect(verify({ birthYear: 2008, birthMonth: 2, birthDay: 29 }, new Date("2027-03-01T03:00:00Z")).eligible).toBe(
      true,
    );
  });

  it("rejects dates that do not exist", () => {
    for (const [birthMonth, birthDay, birthYear] of [
      [2, 30, 1999],
      [2, 29, 2001], // 2001 is not a leap year
      [4, 31, 1999],
      [13, 1, 1999],
      [0, 10, 1999],
      [5, 0, 1999],
    ] as const) {
      expect(verify({ birthYear, birthMonth, birthDay })).toEqual({ eligible: false, reason: "INVALID_DATE" });
    }
    expect(verify({ birthYear: 2000, birthMonth: 2, birthDay: 29 }).eligible).toBe(true);
  });

  it("rejects a non-integer month or day", () => {
    expect(verify({ birthYear: 1999, birthMonth: 5.5 })).toEqual({ eligible: false, reason: "INVALID_DATE" });
    expect(verify({ birthYear: 1999, birthDay: Number.NaN })).toEqual({ eligible: false, reason: "INVALID_DATE" });
  });

  it("rejects a birth date in the future", () => {
    expect(verify({ birthYear: 2027 })).toEqual({ eligible: false, reason: "IMPLAUSIBLE_YEAR" });
    expect(verify({ birthYear: 2026, birthMonth: 12, birthDay: 1 })).toEqual({
      eligible: false,
      reason: "INVALID_DATE",
    });
  });

  it("rejects an implausibly old birth year", () => {
    expect(verify({ birthYear: 1800 })).toEqual({ eligible: false, reason: "IMPLAUSIBLE_YEAR" });
  });

  it("rejects a non-integer birth year", () => {
    expect(verify({ birthYear: 1999.5 })).toEqual({ eligible: false, reason: "IMPLAUSIBLE_YEAR" });
  });

  it("checks the implausible-year case before the attestation, so it isn't masked by a different error", () => {
    expect(verify({ birthYear: 3000, attestedAdult: false })).toEqual({
      eligible: false,
      reason: "IMPLAUSIBLE_YEAR",
    });
  });

  it("stamps verifiedAt with the instant checked, not wall-clock time", () => {
    const result = verify({ birthYear: 1990 });
    expect(result.eligible && result.verifiedAt).toEqual(NOW);
  });
});

describe("Track A age verifier (identity agency, not configured)", () => {
  beforeEach(() => {
    process.env.AGE_VERIFICATION_TRACK = "A";
  });
  afterEach(() => {
    delete process.env.AGE_VERIFICATION_TRACK;
  });

  it("is selected when AGE_VERIFICATION_TRACK=A", () => {
    expect(getActiveAgeVerifier().track).toBe("A");
  });

  it("throws a clear error instead of silently approving anyone", () => {
    expect(() =>
      getActiveAgeVerifier().verify({ birthYear: 1990, birthMonth: 6, birthDay: 15, attestedAdult: true }),
    ).toThrow(/not configured/);
  });
});
