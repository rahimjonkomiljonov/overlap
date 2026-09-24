/**
 * Academic terms, Korean calendar: "YYYY-1" (spring semester, March–June), "YYYY-2"
 * (fall semester, September–December), "YYYY-S" / "YYYY-W" (summer and winter
 * sessions). Courses are imported per term and expire with it (B4).
 */
export const TERM_PATTERN = /^\d{4}-(1|2|S|W)$/;

/**
 * The regular semester a date belongs to, in Seoul time. Summer break (July–August)
 * still counts as the spring term and January–February as the previous fall term, so
 * profiles keep their courses until the next semester's catalog replaces them.
 */
export function currentTerm(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);

  if (month <= 2) return `${year - 1}-2`;
  if (month <= 8) return `${year}-1`;
  return `${year}-2`;
}
