import { scheduledRangeForSlot } from "./schedule";

export interface RankedSlot {
  slotIndex: number;
  day: number;
  block: number;
  start: Date;
  end: Date;
}

export function decodeSlotIndex(slotIndex: number): { day: number; block: number } {
  return { day: Math.floor(slotIndex / 12), block: slotIndex % 12 };
}

/**
 * E1's "3 slots computed from mutual free windows": the soonest `limit` upcoming
 * occurrences of the shared weekly free-time slots, chronologically — not just the
 * lowest slot indices (Monday-morning-first regardless of what day it actually is).
 */
export function rankUpcomingSlots(
  sharedSlotIndices: number[],
  now: Date = new Date(),
  limit = 3,
): RankedSlot[] {
  return sharedSlotIndices
    .map((slotIndex) => {
      const { day, block } = decodeSlotIndex(slotIndex);
      const { start, end } = scheduledRangeForSlot(day, block, now);
      return { slotIndex, day, block, start, end };
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, limit);
}

export interface SlotOption extends RankedSlot {
  spotId: string;
}

/**
 * Pairs each ranked slot with a curated Safe Spot, round-robin — repeats spots if there
 * are fewer of them than slots (S06's sample data has only a handful per campus), and
 * returns no options at all if the campus has no safe spots configured yet (the caller
 * decides how to surface that, this function just never invents a placeholder spot).
 */
export function pairSlotsWithSpots(slots: RankedSlot[], spotIds: string[]): SlotOption[] {
  if (spotIds.length === 0) return [];
  return slots.map((slot, i) => ({ ...slot, spotId: spotIds[i % spotIds.length] }));
}
