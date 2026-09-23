/**
 * Age gate (A2): 19+ only, verified rather than a bare self-typed date of birth. Two
 * tracks behind one interface, so switching is cheap once an identity-verification
 * agency contract exists (owner task O5) — see docs/BUILD_PLAN.md §0 assumption 2.
 *
 * - Track B (default, active now): campus email + declared birth year + an explicit
 *   "I am 19 or older" attestation. Weaker than a real check; accepted in writing by
 *   the owner as an interim measure (Step S25), not yet reviewed by a lawyer.
 * - Track A (not built): a real identity-verification agency. Throws until configured.
 */

export type AgeVerificationInput = {
  birthYear: number;
  attestedAdult: boolean;
};

export type AgeVerificationReason = "IMPLAUSIBLE_YEAR" | "NOT_ATTESTED" | "TOO_YOUNG";

export type AgeVerificationResult =
  { eligible: true; verifiedAt: Date } | { eligible: false; reason: AgeVerificationReason };

export interface AgeVerifier {
  readonly track: "A" | "B";
  verify(input: AgeVerificationInput, now?: Date): AgeVerificationResult;
}

const MIN_PLAUSIBLE_BIRTH_YEAR = 1900;
const ADULT_AGE = 19;

class TrackBAgeVerifier implements AgeVerifier {
  readonly track = "B" as const;

  verify(
    { birthYear, attestedAdult }: AgeVerificationInput,
    now = new Date(),
  ): AgeVerificationResult {
    if (
      !Number.isInteger(birthYear) ||
      birthYear < MIN_PLAUSIBLE_BIRTH_YEAR ||
      birthYear > now.getFullYear()
    ) {
      return { eligible: false, reason: "IMPLAUSIBLE_YEAR" };
    }
    if (!attestedAdult) {
      return { eligible: false, reason: "NOT_ATTESTED" };
    }
    // "Year age" (current year minus birth year), the Youth Protection Act convention
    // — not the full-19th-birthday rule (Civil Act), which isn't computable from a
    // birth year alone (we deliberately never collect a full date of birth). Which
    // rule to use for real is REQUIREMENTS.md §15.6's open "decision for counsel".
    const yearAge = now.getFullYear() - birthYear;
    if (yearAge < ADULT_AGE) {
      return { eligible: false, reason: "TOO_YOUNG" };
    }
    return { eligible: true, verifiedAt: now };
  }
}

class TrackAAgeVerifier implements AgeVerifier {
  readonly track = "A" as const;

  verify(): AgeVerificationResult {
    throw new Error("Track A (identity-verification agency) is not configured. See owner task O5.");
  }
}

export function getActiveAgeVerifier(): AgeVerifier {
  return process.env.AGE_VERIFICATION_TRACK === "A"
    ? new TrackAAgeVerifier()
    : new TrackBAgeVerifier();
}
