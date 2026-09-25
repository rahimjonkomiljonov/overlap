import { seoulDayRange } from "@/server/matching/seoul-date";

/** Two-hour blocks, same scheme as `Profile.freeTimeSlots` (B7). */
export const BLOCK_HOURS = 2;

const WEEKDAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function seoulWeekdayIndex(now: Date): number {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", weekday: "short" }).format(now);
  const index = WEEKDAY_ORDER.indexOf(weekday);
  if (index === -1) throw new Error(`seoulWeekdayIndex: unexpected weekday "${weekday}"`);
  return index;
}

/**
 * The next real UTC instant matching `day` (0=Mon..6=Sun) / `block` (0-11, two-hour
 * blocks) in Seoul local time, strictly after `now` — if today already is that weekday
 * but the block has already started, this resolves to *next* week's occurrence, never
 * today's already-past one. Reuses `seoulDayRange`'s fixed 9h-offset approach (safe:
 * Korea has no DST) rather than re-deriving Seoul midnight another way.
 */
export function nextSeoulOccurrence(day: number, block: number, now: Date = new Date()): Date {
  const { start: todaySeoulMidnightUtc } = seoulDayRange(now);
  const daysAhead = (day - seoulWeekdayIndex(now) + 7) % 7;
  const candidate = new Date(
    todaySeoulMidnightUtc.getTime() + daysAhead * 24 * 60 * 60 * 1000 + block * BLOCK_HOURS * 60 * 60 * 1000,
  );
  return candidate.getTime() > now.getTime() ? candidate : new Date(candidate.getTime() + 7 * 24 * 60 * 60 * 1000);
}

export function scheduledRangeForSlot(
  day: number,
  block: number,
  now: Date = new Date(),
): { start: Date; end: Date } {
  const start = nextSeoulOccurrence(day, block, now);
  return { start, end: new Date(start.getTime() + BLOCK_HOURS * 60 * 60 * 1000) };
}
