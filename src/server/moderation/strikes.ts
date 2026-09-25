import { ModerationActionType } from "@/generated/prisma/enums";

/** DISMISS and POLICE_REFERRAL don't count toward the strike ladder — only an actual warn/suspend/ban does. */
const STRIKE_TYPES: ReadonlySet<ModerationActionType> = new Set([
  ModerationActionType.WARN,
  ModerationActionType.SUSPEND,
  ModerationActionType.BAN,
]);

export function countPriorStrikes(actionTypes: ModerationActionType[]): number {
  return actionTypes.filter((t) => STRIKE_TYPES.has(t)).length;
}

const LADDER: ModerationActionType[] = [
  ModerationActionType.WARN,
  ModerationActionType.SUSPEND,
  ModerationActionType.BAN,
];

/**
 * G8's warn → 7-day suspension → permanent ban ladder, as a *suggestion* shown to the
 * moderator in the admin queue — never enforced automatically. A moderator can still pick
 * any action regardless (the playbook: "a single urgent substantiated report can jump
 * straight to permanent ban," which this function has no say in).
 */
export function suggestNextAction(priorStrikes: number): ModerationActionType {
  return LADDER[Math.min(priorStrikes, LADDER.length - 1)];
}
