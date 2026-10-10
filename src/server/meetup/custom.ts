import { seoulDayRange } from "@/server/matching/seoul-date";
import { BLOCK_HOURS, seoulWeekdayIndex } from "./schedule";

/**
 * "Suggest your own time" (E1 fallback): when two people share no free time, or none of
 * the suggested times work, one of them can pick a day and a two-hour block themselves.
 * Still on the same grid as free-time slots (day 0=Mon..6=Sun, block 0-11 of two hours), so
 * a custom proposal looks exactly like a suggested one to everything downstream, and still
 * at a Safe Spot.
 */

/** How many days ahead (today counts as day 0) a custom time can be set. */
export const CUSTOM_DAY_RANGE = 14;

/** Daytime blocks only: 08:00-10:00 up to 20:00-22:00. */
export const CUSTOM_BLOCKS: readonly number[] = [4, 5, 6, 7, 8, 9, 10];

/** The earliest a meetup can start from now, so the other person has time to answer. */
export const CUSTOM_MIN_LEAD_MS = 60 * 60 * 1000;

export interface CustomSlot {
  day: number;
  block: number;
  start: Date;
  end: Date;
}

/** The Seoul-midnight instant of each selectable day, today first. */
export function customDayStarts(now: Date = new Date()): Date[] {
  const { start } = seoulDayRange(now);
  return Array.from({ length: CUSTOM_DAY_RANGE }, (_, i) => new Date(start.getTime() + i * 24 * 60 * 60 * 1000));
}

/**
 * The real start/end for a chosen day offset and block, or null when it is not allowed:
 * an offset outside the range, a block outside daytime, or a start less than an hour away.
 */
export function customSlot(dayOffset: number, block: number, now: Date = new Date()): CustomSlot | null {
  if (!Number.isInteger(dayOffset) || dayOffset < 0 || dayOffset >= CUSTOM_DAY_RANGE) return null;
  if (!CUSTOM_BLOCKS.includes(block)) return null;

  const midnight = customDayStarts(now)[dayOffset];
  const start = new Date(midnight.getTime() + block * BLOCK_HOURS * 60 * 60 * 1000);
  if (start.getTime() < now.getTime() + CUSTOM_MIN_LEAD_MS) return null;

  return {
    day: seoulWeekdayIndex(start),
    block,
    start,
    end: new Date(start.getTime() + BLOCK_HOURS * 60 * 60 * 1000),
  };
}
