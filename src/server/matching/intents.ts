import { IntentMode } from "@/generated/prisma/enums";

/**
 * The modes people are actually matched in. "Open to anything" is not a fourth pool of its
 * own: an Open profile joins all three of these, so it never ends up alone in a pool of
 * people who also chose only Open (which is what it did before, and why two people on
 * different modes could never meet).
 */
export const MATCHING_INTENTS = [IntentMode.FRIENDS, IntentMode.STUDY, IntentMode.DATING] as const;

/**
 * The pools a profile takes part in. Open means Friends and Study always, and Dating only
 * when the person has stored their "who I'd like to meet" preference. That field exists
 * only while the sensitive-preference consent is granted (withdrawing deletes it), so
 * Open can never put someone into Dating without that consent. The cohort release gate
 * for Dating is applied separately when the pool is loaded.
 */
export function effectiveIntents(intents: readonly IntentMode[], options: { hasDatingPreference: boolean }): IntentMode[] {
  const result = new Set<IntentMode>();
  const open = intents.includes(IntentMode.OPEN);
  for (const intent of MATCHING_INTENTS) {
    if (intent === IntentMode.DATING) {
      if (intents.includes(IntentMode.DATING) || (open && options.hasDatingPreference)) result.add(intent);
    } else if (intents.includes(intent) || open) {
      result.add(intent);
    }
  }
  return [...result];
}

/**
 * The Prisma `profile` filter for "belongs to this pool": the explicit mode, or Open
 * (Dating again only with a stored preference).
 */
export function intentPoolFilter(intent: IntentMode) {
  if (intent === IntentMode.DATING) {
    return {
      OR: [
        { intents: { has: IntentMode.DATING } },
        { intents: { has: IntentMode.OPEN }, interestedIn: { not: null } },
      ],
    };
  }
  if (intent === IntentMode.OPEN) return { intents: { has: IntentMode.OPEN } };
  return { OR: [{ intents: { has: intent } }, { intents: { has: IntentMode.OPEN } }] };
}
