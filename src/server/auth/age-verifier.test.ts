import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getActiveAgeVerifier } from "./age-verifier";

const NOW = new Date("2026-09-23T00:00:00Z"); // year 2026

describe("Track B age verifier (default)", () => {
  beforeEach(() => {
    delete process.env.AGE_VERIFICATION_TRACK;
  });

  it("accepts someone who turns 19 this year and attests", () => {
    const verifier = getActiveAgeVerifier();
    expect(verifier.track).toBe("B");
    const result = verifier.verify({ birthYear: 2007, attestedAdult: true }, NOW);
    expect(result.eligible).toBe(true);
  });

  it("accepts someone clearly older", () => {
    const result = getActiveAgeVerifier().verify({ birthYear: 1990, attestedAdult: true }, NOW);
    expect(result.eligible).toBe(true);
  });

  it("blocks someone who turns 18 this year, even if they attest", () => {
    const result = getActiveAgeVerifier().verify({ birthYear: 2008, attestedAdult: true }, NOW);
    expect(result).toEqual({ eligible: false, reason: "TOO_YOUNG" });
  });

  it("blocks a clearly underage birth year", () => {
    const result = getActiveAgeVerifier().verify({ birthYear: 2015, attestedAdult: true }, NOW);
    expect(result).toEqual({ eligible: false, reason: "TOO_YOUNG" });
  });

  it("blocks a plausible adult birth year without the attestation checked", () => {
    const result = getActiveAgeVerifier().verify({ birthYear: 1990, attestedAdult: false }, NOW);
    expect(result).toEqual({ eligible: false, reason: "NOT_ATTESTED" });
  });

  it("rejects a birth year in the future", () => {
    const result = getActiveAgeVerifier().verify({ birthYear: 2027, attestedAdult: true }, NOW);
    expect(result).toEqual({ eligible: false, reason: "IMPLAUSIBLE_YEAR" });
  });

  it("rejects an implausibly old birth year", () => {
    const result = getActiveAgeVerifier().verify({ birthYear: 1800, attestedAdult: true }, NOW);
    expect(result).toEqual({ eligible: false, reason: "IMPLAUSIBLE_YEAR" });
  });

  it("rejects a non-integer birth year", () => {
    const result = getActiveAgeVerifier().verify({ birthYear: 1999.5, attestedAdult: true }, NOW);
    expect(result).toEqual({ eligible: false, reason: "IMPLAUSIBLE_YEAR" });
  });

  it("checks the implausible-year case before the attestation, so it isn't masked by a different error", () => {
    const result = getActiveAgeVerifier().verify({ birthYear: 3000, attestedAdult: false }, NOW);
    expect(result).toEqual({ eligible: false, reason: "IMPLAUSIBLE_YEAR" });
  });

  it("stamps verifiedAt with the instant checked, not wall-clock time", () => {
    const result = getActiveAgeVerifier().verify({ birthYear: 1990, attestedAdult: true }, NOW);
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
    expect(() => getActiveAgeVerifier().verify({ birthYear: 1990, attestedAdult: true })).toThrow(
      /not configured/,
    );
  });
});
