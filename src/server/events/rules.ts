import { intersectDeduped } from "@/server/matching/terms";

/** F3: the "Connect" window opens when an event ends and lasts 48 hours. */
export const CONNECT_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Longest event an organizer can create; keeps the connect window tied to a real meet. */
export const MAX_EVENT_DURATION_MS = 12 * 60 * 60 * 1000;

export type EventPhase = "upcoming" | "ongoing" | "connect" | "closed" | "cancelled";

export function eventPhase(
  event: { startsAt: Date; endsAt: Date; cancelledAt: Date | null },
  now: Date,
): EventPhase {
  if (event.cancelledAt) return "cancelled";
  const t = now.getTime();
  if (t < event.startsAt.getTime()) return "upcoming";
  if (t < event.endsAt.getTime()) return "ongoing";
  if (t < event.endsAt.getTime() + CONNECT_WINDOW_MS) return "connect";
  return "closed";
}

/** RSVPs (and changing them) are open until the event ends. */
export function canRsvp(phase: EventPhase): boolean {
  return phase === "upcoming" || phase === "ongoing";
}

/**
 * Event form times come from `<input type="datetime-local">`, which has no time zone.
 * Campus time is Korea (UTC+9, no daylight saving), so read them as Seoul time; the
 * server itself runs in UTC.
 */
export function parseSeoulLocalDateTime(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+09:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type OverlapProfile = {
  userId: string;
  courseIds: string[];
  clubIds: string[];
  interestTagIds: string[];
};

/** Shared courses, clubs and interests between two people; the F2 "ranked by overlap" key. */
export function overlapCount(a: OverlapProfile, b: OverlapProfile): number {
  return (
    intersectDeduped(a.courseIds, b.courseIds).length +
    intersectDeduped(a.clubIds, b.clubIds).length +
    intersectDeduped(a.interestTagIds, b.interestTagIds).length
  );
}

/** Most overlap first; ties keep their original (RSVP) order. */
export function rankByOverlap<T extends OverlapProfile>(
  viewer: OverlapProfile,
  others: T[],
): (T & { overlap: number })[] {
  // Array.prototype.sort is stable, so equal-overlap guests keep their RSVP order.
  return others
    .map((o) => ({ ...o, overlap: overlapCount(viewer, o) }))
    .sort((x, y) => y.overlap - x.overlap);
}
