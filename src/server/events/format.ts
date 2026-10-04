/**
 * Event times formatted on the server in Seoul time. Formatting dates inside client
 * components can hydrate differently from the server (CLAUDE.md: "오전" vs "AM"), so pages
 * pass these strings down instead of Date objects.
 */
export function formatEventTime(startsAt: Date, endsAt: Date, locale: string): string {
  const tag = locale === "en" ? "en-US" : "ko-KR";
  const day = new Intl.DateTimeFormat(tag, {
    timeZone: "Asia/Seoul",
    month: "short",
    day: "numeric",
    weekday: "short",
  });
  const time = new Intl.DateTimeFormat(tag, {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const sameDay = day.format(startsAt) === day.format(endsAt);
  return sameDay
    ? `${day.format(startsAt)} ${time.format(startsAt)}–${time.format(endsAt)}`
    : `${day.format(startsAt)} ${time.format(startsAt)} – ${day.format(endsAt)} ${time.format(endsAt)}`;
}
