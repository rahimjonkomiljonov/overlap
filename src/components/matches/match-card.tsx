"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { MeetupStatusDot } from "@/components/meetup/meetup-banner";
import { BlockButton } from "@/components/safety/block-button";
import { ReportButton } from "@/components/safety/report-button";
import { Link } from "@/i18n/navigation";
import { unmatch, type UnmatchState } from "@/server/waves/actions";
import type { MatchSummary } from "@/server/waves/queries";

const idleUnmatchState: UnmatchState = { status: "idle" };

/** One active match: chat link (S15) plus unmatch, with an inline confirm step rather than a destructive one-tap button. */
export function MatchCard({
  match,
  onUnmatched,
}: {
  match: MatchSummary;
  onUnmatched: (matchId: string) => void;
}) {
  const t = useTranslations("Matches");
  const [confirming, setConfirming] = useState(false);

  const [unmatchState, unmatchAction] = useActionState(unmatch, idleUnmatchState);

  const [lastUnmatchState, setLastUnmatchState] = useState(unmatchState);
  if (unmatchState !== lastUnmatchState) {
    setLastUnmatchState(unmatchState);
    if (unmatchState.status === "success") onUnmatched(match.matchId);
  }

  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <Link
          href={`/profile/${match.otherUserId}`}
          aria-label={t("openProfile", { name: match.firstName ?? "" })}
          className="flex min-w-0 items-center gap-4 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Avatar size="lg">
            {match.photoUrl && <AvatarImage src={match.photoUrl} alt="" />}
            <AvatarFallback>{match.firstName?.[0] ?? "?"}</AvatarFallback>
          </Avatar>
          <p className="truncate font-medium">{match.firstName}</p>
        </Link>
        {match.meetup && (
          <Badge
            variant={match.meetup.status === "ACCEPTED" ? "default" : match.meetup.status === "DECLINED" ? "destructive" : "secondary"}
            className="ml-auto"
          >
            {match.meetup.status === "ACCEPTED"
              ? t("meetupConfirmed")
              : match.meetup.status === "DECLINED"
                ? t("meetupDeclined")
                : t("meetupPending")}
          </Badge>
        )}
      </CardContent>

      <CardFooter className="flex-col items-stretch gap-3">
        {unmatchState.status === "error" && (
          <p role="alert" className="text-sm text-destructive">
            {t(`errors.${unmatchState.code}` as never)}
          </p>
        )}

        {confirming ? (
          <div className="flex items-center justify-end gap-2">
            <p className="mr-auto text-sm text-muted-foreground">{t("unmatchConfirm")}</p>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
              {t("cancel")}
            </Button>
            <form action={unmatchAction}>
              <input type="hidden" name="matchId" value={match.matchId} />
              <Button type="submit" variant="destructive">
                {t("unmatch")}
              </Button>
            </form>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
              {t("unmatch")}
            </Button>
            <div className="flex gap-2">
              <Link
                href={`/meetup/${match.matchId}`}
                className={`${buttonVariants({ variant: "outline" })} relative`}
              >
                {match.meetup ? t("viewMeetup") : t("planMeetup")}
                {match.meetup && <MeetupStatusDot status={match.meetup.status} unseen={match.meetup.unseen} />}
              </Link>
              {match.conversationId && (
                <Link href={`/matches/${match.conversationId}`} className={buttonVariants()}>
                  {t("chatButton")}
                </Link>
              )}
            </div>
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <ReportButton targetUserId={match.otherUserId} conversationId={match.conversationId ?? undefined} />
          <BlockButton targetUserId={match.otherUserId} onBlocked={() => onUnmatched(match.matchId)} />
        </div>
      </CardFooter>
    </Card>
  );
}
