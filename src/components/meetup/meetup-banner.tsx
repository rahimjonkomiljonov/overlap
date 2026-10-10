"use client";

import { CalendarCheck, CalendarClock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { ActiveMeetupSummary } from "@/server/meetup/summary";

/** The pulsing ring used on every "there is a meetup" control (see `.meetup-glow` in globals.css). */
export const MEETUP_GLOW_CLASS = "meetup-glow";

/** When a meetup starts, in Seoul time with a fixed 24-hour clock so the server and browser render the same text. */
export function useMeetupWhen(meetup: ActiveMeetupSummary): { when: string; where: string } {
  const locale = useLocale();
  const formatter = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", {
    timeZone: "Asia/Seoul",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return {
    when: formatter.format(new Date(meetup.start)),
    where: locale === "en" ? (meetup.spotNameEn ?? meetup.spotName) : meetup.spotName,
  };
}

/**
 * Sits at the top of a chat while the two people have a live meetup: confirmed (the
 * strong version, glowing) or suggested and waiting for an answer. Tapping it opens the
 * meetup page. The state is spelled out in words as well as the glow, so it never relies on
 * colour or motion alone.
 */
export function MeetupBanner({ meetup, matchId, actorUserId }: { meetup: ActiveMeetupSummary; matchId: string; actorUserId: string }) {
  const t = useTranslations("Meetup");
  const { when, where } = useMeetupWhen(meetup);
  const confirmed = meetup.status === "ACCEPTED";
  const mine = meetup.proposedByUserId === actorUserId;

  return (
    <Link
      href={`/meetup/${matchId}`}
      className={`mt-3 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
        confirmed
          ? `border-primary bg-primary/10 text-foreground ${MEETUP_GLOW_CLASS}`
          : "border-border bg-muted text-foreground"
      }`}
    >
      {confirmed ? (
        <CalendarCheck className="size-5 shrink-0 text-primary" aria-hidden="true" />
      ) : (
        <CalendarClock className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      <span className="min-w-0">
        <span className="block font-medium">
          {confirmed ? t("bannerConfirmed") : mine ? t("bannerWaitingForThem") : t("bannerNeedsYourAnswer")}
        </span>
        <span className="block truncate text-muted-foreground">
          {when} · {where}
        </span>
      </span>
    </Link>
  );
}
