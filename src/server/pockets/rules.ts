import { IntentMode } from "@/generated/prisma/enums";

/**
 * C7 Campus Pockets only connect people for Friends, Study or Open. Dating stays out:
 * a pocket is a plain, non-algorithmic list, so it would bypass the Dating gender and
 * preference filter (which needs the encrypted `interestedIn`) and the cohort density
 * gate. Dating keeps going through Daily Picks only.
 */
export const POCKET_INTENTS: readonly IntentMode[] = [
  IntentMode.FRIENDS,
  IntentMode.STUDY,
  IntentMode.OPEN,
];

/**
 * The intents two people could meet under in a pocket, or an empty list when they are
 * not compatible. OPEN ("open to anything") fits any pocket intent on the other side.
 */
export function compatiblePocketIntents(a: IntentMode[], b: IntentMode[]): IntentMode[] {
  const mine = new Set(a.filter((i) => POCKET_INTENTS.includes(i)));
  const theirs = new Set(b.filter((i) => POCKET_INTENTS.includes(i)));
  if (mine.size === 0 || theirs.size === 0) return [];
  if (mine.has(IntentMode.OPEN)) return [...theirs];
  if (theirs.has(IntentMode.OPEN)) return [...mine];
  return [...mine].filter((i) => theirs.has(i));
}

export type PocketKind = "course" | "club";
