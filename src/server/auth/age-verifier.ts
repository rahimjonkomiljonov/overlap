/**
 * Age gate (A2): 19+ only, verified rather than a bare self-typed date of birth. Two
 * tracks behind one interface, so switching is cheap once an identity-verification
 * agency contract exists (owner task O5) — see docs/BUILD_PLAN.md §0 assumption 2.
 *
 * - Track B (default, active now): campus email + declared full birth date + an explicit
 *   "I am 19 or older" attestation. Weaker than a real check; accepted in writing by
 *   the owner as an interim measure (Step S25), not yet reviewed by a lawyer. The month
 *   and day are used for this one check and then dropped: only the birth year is ever
 *   stored (data minimisation), so never add month/day to a database write or a log line.
 * - Track A (not built): a real identity-verification agency. Throws until configured.
 */

import { seoulCalendarDate } from "@/server/matching/seoul-date";

export type AgeVerificationInput = {
  birthYear: number;
  birthMonth: number;
  birthDay: number;
  attestedAdult: boolean;
};

export type AgeVerificationReason =
  | "IMPLAUSIBLE_YEAR"
  | "INVALID_DATE"
  | "NOT_ATTESTED"
  | "TOO_YOUNG";

export type AgeVerificationResult =
  { eligible: true; verifiedAt: Date } | { eligible: false; reason: AgeVerificationReason };

export interface AgeVerifier {
  readonly track: "A" | "B";
  verify(input: AgeVerificationInput, now?: Date): AgeVerificationResult;
}

const MIN_PLAUSIBLE_BIRTH_YEAR = 1900;
const ADULT_AGE = 19;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

/**
 * True once the full 19th birthday has passed on `today` (a Seoul calendar date) — the
 * Civil Act's "man nai" rule, which is stricter than the Youth Protection Act's
 * birth-year rule, so passing this passes both. Someone born on 29 Feb has their
 * birthday on 1 Mar in a non-leap year (the later, safer reading).
 */
function hasTurnedAdult(
  birth: { year: number; month: number; day: number },
  today: { year: number; month: number; day: number },
): boolean {
  const adultYear = birth.year + ADULT_AGE;
  let month = birth.month;
  let day = birth.day;
  if (month === 2 && day === 29 && !isLeapYear(adultYear)) {
    month = 3;
    day = 1;
  }
  if (today.year !== adultYear) return today.year > adultYear;
  return today.month > month || (today.month === month && today.day >= day);
}

class TrackBAgeVerifier implements AgeVerifier {
  readonly track = "B" as const;

  verify(
    { birthYear, birthMonth, birthDay, attestedAdult }: AgeVerificationInput,
    now = new Date(),
  ): AgeVerificationResult {
    // The Seoul calendar day, not the server's UTC day (Korea is UTC+9, no DST).
    const seoulToday = seoulCalendarDate(now);
    const today = {
      year: seoulToday.getUTCFullYear(),
      month: seoulToday.getUTCMonth() + 1,
      day: seoulToday.getUTCDate(),
    };
    if (
      !Number.isInteger(birthYear) ||
      birthYear < MIN_PLAUSIBLE_BIRTH_YEAR ||
      birthYear > today.year
    ) {
      return { eligible: false, reason: "IMPLAUSIBLE_YEAR" };
    }
    if (
      !Number.isInteger(birthMonth) ||
      !Number.isInteger(birthDay) ||
      birthMonth < 1 ||
      birthMonth > 12 ||
      birthDay < 1 ||
      birthDay > daysInMonth(birthYear, birthMonth)
    ) {
      return { eligible: false, reason: "INVALID_DATE" };
    }
    const birth = { year: birthYear, month: birthMonth, day: birthDay };
    const isFuture =
      birth.year === today.year &&
      (birth.month > today.month || (birth.month === today.month && birth.day > today.day));
    if (isFuture) {
      return { eligible: false, reason: "INVALID_DATE" };
    }
    if (!attestedAdult) {
      return { eligible: false, reason: "NOT_ATTESTED" };
    }
    if (!hasTurnedAdult(birth, today)) {
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
