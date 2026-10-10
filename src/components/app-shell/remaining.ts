/** Days, hours and minutes left, e.g. 3 days 4 h; the largest two units only. */
export function remainingParts(ms: number): { days: number; hours: number; minutes: number } {
  const total = Math.max(0, Math.floor(ms / 60_000));
  return { days: Math.floor(total / 1440), hours: Math.floor((total % 1440) / 60), minutes: total % 60 };
}
