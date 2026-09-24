/**
 * `now`'s Seoul calendar date, as a UTC-midnight `Date` — matches Prisma's `@db.Date`
 * column semantics (`DailyBatch.batchDate`), so "one batch per user/intent/day" means
 * the Seoul calendar day the drop happens on (12:00 KST, REQUIREMENTS.md §5.3/C1), not
 * whatever UTC day the server process happens to be running in.
 */
export function seoulCalendarDate(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")!.value;
  const month = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
}

/**
 * The real UTC instant range `[start, end)` spanning `now`'s Seoul calendar day —
 * unlike `seoulCalendarDate()`'s UTC-midnight *label* (fine for a `@db.Date` column, but
 * 9 hours off from the actual Seoul-midnight instant), this is for comparing against
 * real timestamps (e.g. `Wave.createdAt`) to count "how many today" correctly. Safe as a
 * fixed 9-hour offset because Korea has no DST.
 */
export function seoulDayRange(now: Date = new Date()): { start: Date; end: Date } {
  const label = seoulCalendarDate(now);
  const start = new Date(label.getTime() - 9 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}
