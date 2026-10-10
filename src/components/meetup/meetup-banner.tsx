"use client";

import { CalendarCheck, CalendarClock, CalendarX } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { ActiveMeetupSummary } from "@/server/meetup/summary";

type DotStatus = ActiveMeetupSummary["status"];

const DOT_COLOR: Record<DotStatus, string> = {
  PROPOSED: "bg-yellow-400",
  ACCEPTED: "bg-green-500",
  DECLINED: "bg-red-500",
};

/**
 * The little status light on every control that points at a meetup: yellow while it waits
 * for an answer, green once confirmed, red when the other person said no. It blinks while
 * the viewer has not opened the meetup since the status last changed, and stays steady
 * after. The meaning is also in the accessible text next to it, never in colour alone.
 * Place it inside a `relative` parent.
 */
export function MeetupStatusDot({ status, unseen, className = "" }: { status: DotStatus; unseen: boolean; className?: string }) {
  const t = useTranslations("Meetup");
  const label =
    status === "ACCEPTED" ? t("dotConfirmed") : status === "DECLINED" ? t("dotDeclined") : t("dotWaiting");
  return (
    <span
      role="img"
      aria-label={unseen ? `${label}, ${t("dotNew")}` : label}
      className={`pointer-events-none absolute -top-1 -right-1 size-3 rounded-full ring-2 ring-background ${DOT_COLOR[status]} ${
        unseen ? "meetup-dot-blink" : ""
      } ${className}`}
    />
  );
}

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
 * Sits at the top of a chat while the two people have a meetup to know about: confirmed,
 * suggested and waiting, or declined. Tapping it opens the meetup page (which is also what
 * marks it as seen). The state is spelled out in words as well as the dot.
 */
export function MeetupBanner({
  meetup,
  matchId,
  actorUserId,
}: {
  meetup: ActiveMeetupSummary;
  matchId: string;
  actorUserId: string;
}) {
  const t = useTranslations("Meetup");
  const { when, where } = useMeetupWhen(meetup);
  const mine = meetup.proposedByUserId === actorUserId;
  const Icon = meetup.status === "ACCEPTED" ? CalendarCheck : meetup.status === "DECLINED" ? CalendarX : CalendarClock;
  const title =
    meetup.status === "ACCEPTED"
      ? t("bannerConfirmed")
      : meetup.status === "DECLINED"
        ? t("bannerDeclined")
        : mine
          ? t("bannerWaitingForThem")
          : t("bannerNeedsYourAnswer");

  return (
    <Link
      href={`/meetup/${matchId}`}
      className="relative mt-3 flex items-center gap-3 rounded-xl border border-border bg-muted px-4 py-3 text-sm text-foreground"
    >
      <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        <span className="block truncate text-muted-foreground">
          {when} · {where}
        </span>
      </span>
      <MeetupStatusDot status={meetup.status} unseen={meetup.unseen} />
    </Link>
  );
}
