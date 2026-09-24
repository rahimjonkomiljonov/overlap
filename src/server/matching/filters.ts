import { Gender, IntentMode } from "@/generated/prisma/enums";

export interface GenderFitInput {
  gender: Gender;
  /** Decrypted `Profile.interestedIn` — null means not set (never true for DATING, which requires it at onboarding). */
  interestedIn: Gender[] | null;
}

/**
 * Gender/preference is only ever a hard filter for Dating — Friends/Study never exclude
 * anyone on it (REQUIREMENTS.md frames `interestedIn` as dating-specific, and it's the
 * one field gated behind the separate SENSITIVE_PREFERENCE consent). Fails closed: a
 * missing `interestedIn` under Dating excludes rather than assumes, even though the
 * onboarding flow (src/server/profile/actions.ts's DATING_REQUIRES_CONSENT) shouldn't
 * let that combination exist.
 */
export function passesGenderFilter(intent: IntentMode, viewer: GenderFitInput, candidate: GenderFitInput): boolean {
  if (intent !== IntentMode.DATING) return true;
  if (!viewer.interestedIn || !candidate.interestedIn) return false;
  return viewer.interestedIn.includes(candidate.gender) && candidate.interestedIn.includes(viewer.gender);
}
