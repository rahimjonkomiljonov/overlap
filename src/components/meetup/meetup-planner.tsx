"use client";

import { useActionState } from "react";
import { CalendarX } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { EmptyState } from "@/components/states/empty-state";
import { PageHeader } from "@/components/states/page-header";
import { EmergencyCard } from "@/components/safety/emergency-card";
import { ReportButton } from "@/components/safety/report-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  cancelMeetup,
  createShareLink,
  proposeCustomMeetup,
  proposeMeetup,
  respondToMeetup,
  submitMeetupFeedback,
  type CreateShareLinkState,
  type MeetupActionState,
} from "@/server/meetup/actions";
import type { EmergencyContact } from "@/server/safety/emergency";
import { useRefreshOnSuccess } from "@/hooks/use-refresh-on-success";

export interface ProposalView {
  proposalId: string;
  status: "PROPOSED" | "ACCEPTED";
  proposedByUserId: string;
  scheduledStart: string;
  scheduledEnd: string;
  spotName: string;
  spotNameEn: string | null;
  otherFirstName: string | null;
  otherPhotoUrl: string | null;
  myFeedbackResponse: "GREAT" | "FINE" | "NOT_FOR_ME" | "UNCOMFORTABLE" | null;
  shareLinks: { id: string; token: string; expiresAt: string; revokedAt: string | null }[];
}

export interface OptionView {
  slotIndex: number;
  day: number;
  block: number;
  start: string;
  end: string;
  spotId: string;
  spotName: string;
  spotNameEn: string | null;
}

const idleAction: MeetupActionState = { status: "idle" };
const idleShare: CreateShareLinkState = { status: "idle" };
const FEEDBACK_RESPONSES = ["GREAT", "FINE", "NOT_FOR_ME", "UNCOMFORTABLE"] as const;

/** E1-E4: the meetup planner page — options picker (no active proposal), or the current proposal's confirmation/response card. */
export function MeetupPlanner({
  matchId,
  actorUserId,
  otherUserId,
  proposal,
  options,
  safeSpots,
  customDays,
  emergencyContacts,
  now,
}: {
  safeSpots: SpotView[];
  customDays: string[];
  matchId: string;
  actorUserId: string;
  otherUserId: string;
  proposal: ProposalView | null;
  options: OptionView[];
  emergencyContacts: EmergencyContact[];
  now: string;
}) {
  const t = useTranslations("Meetup");
  return (
    <>
      <PageHeader title={t("title")} />
      <div className="space-y-4">
        <SafetyCard />
        <EmergencyCard contacts={emergencyContacts} />
        {proposal ? (
          <ProposalCard
            actorUserId={actorUserId}
            otherUserId={otherUserId}
            proposal={proposal}
            now={now}
          />
        ) : (
          <OptionsPicker matchId={matchId} options={options} safeSpots={safeSpots} customDays={customDays} />
        )}
      </div>
    </>
  );
}

function SafetyCard() {
  const t = useTranslations("Meetup");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("safetyTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm text-muted-foreground">
        <p>{t("safetyTip1")}</p>
        <p>{t("safetyTip2")}</p>
        <p>{t("safetyTip3")}</p>
      </CardContent>
    </Card>
  );
}

export interface SpotView {
  id: string;
  name: string;
  nameEn: string | null;
}

function OptionsPicker({
  matchId,
  options,
  safeSpots,
  customDays,
}: {
  matchId: string;
  options: OptionView[];
  safeSpots: SpotView[];
  customDays: string[];
}) {
  const t = useTranslations("Meetup");
  const locale = useLocale();
  const [state, action] = useActionState(proposeMeetup, idleAction);

  useRefreshOnSuccess(state);

  // No shared free time (or no Safe Spot to suggest): the person can still make a time.
  if (options.length === 0) {
    if (safeSpots.length === 0) {
      return <EmptyState icon={CalendarX} title={t("noOptionsTitle")} description={t("noSpotsBody")} />;
    }
    return <CustomTimeCard matchId={matchId} safeSpots={safeSpots} customDays={customDays} noOverlap />;
  }

  // hourCycle fixed explicitly: the day-period marker ("오전"/"AM") otherwise depends on
  // the environment's ICU data and can render differently server- vs. client-side for
  // the same locale (a real SSR hydration mismatch this component hit in practice),
  // which 24-hour time sidesteps entirely.
  const formatter = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
  });

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>{t("pickTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {options.map((opt) => (
          <form
            key={opt.slotIndex}
            action={action}
            className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
          >
            <input type="hidden" name="matchId" value={matchId} />
            <input type="hidden" name="spotId" value={opt.spotId} />
            <input type="hidden" name="day" value={opt.day} />
            <input type="hidden" name="block" value={opt.block} />
            <div>
              <p className="font-medium">{formatter.format(new Date(opt.start))}</p>
              <p className="text-sm text-muted-foreground">
                {locale === "en" ? (opt.spotNameEn ?? opt.spotName) : opt.spotName}
              </p>
            </div>
            <Button type="submit">{t("propose")}</Button>
          </form>
        ))}
        {state.status === "error" && (
          <p role="alert" className="text-sm text-destructive">
            {t(`errors.${state.code}` as never)}
          </p>
        )}
      </CardContent>
    </Card>
    {safeSpots.length > 0 && (
      <CustomTimeCard matchId={matchId} safeSpots={safeSpots} customDays={customDays} noOverlap={false} />
    )}
    </>
  );
}

/**
 * "Suggest your own time": a day, a daytime block and a Safe Spot. Shown instead of the
 * suggestions when the two people share no free time, and under them otherwise.
 */
function CustomTimeCard({
  matchId,
  safeSpots,
  customDays,
  noOverlap,
}: {
  matchId: string;
  safeSpots: SpotView[];
  customDays: string[];
  noOverlap: boolean;
}) {
  const t = useTranslations("Meetup");
  const tBlocks = useTranslations("ProfileOnboarding.freeTime");
  const locale = useLocale();
  const [state, action] = useActionState(proposeCustomMeetup, idleAction);
  useRefreshOnSuccess(state);

  const blocks = tBlocks.raw("blocks") as string[];
  const dayFormatter = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", {
    timeZone: "Asia/Seoul",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const selectClass =
    "h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

  return (
    <Card className={noOverlap ? undefined : "mt-4"}>
      <CardHeader>
        <CardTitle>{t("customTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{noOverlap ? t("customBodyNoOverlap") : t("customBodyOverlap")}</p>
        <form action={action} className="space-y-3">
          <input type="hidden" name="matchId" value={matchId} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label htmlFor="custom-day" className="text-sm font-medium">
                {t("customDay")}
              </label>
              <select id="custom-day" name="dayOffset" required defaultValue="" className={selectClass}>
                <option value="" disabled>
                  {t("customSelect")}
                </option>
                {customDays.map((iso, offset) => (
                  <option key={iso} value={offset}>
                    {dayFormatter.format(new Date(iso))}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="custom-block" className="text-sm font-medium">
                {t("customTime")}
              </label>
              <select id="custom-block" name="block" required defaultValue="" className={selectClass}>
                <option value="" disabled>
                  {t("customSelect")}
                </option>
                {[4, 5, 6, 7, 8, 9, 10].map((block) => (
                  <option key={block} value={block}>
                    {blocks[block]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="custom-spot" className="text-sm font-medium">
              {t("customSpot")}
            </label>
            <select id="custom-spot" name="spotId" required defaultValue="" className={selectClass}>
              <option value="" disabled>
                {t("customSelect")}
              </option>
              {safeSpots.map((spot) => (
                <option key={spot.id} value={spot.id}>
                  {locale === "en" ? (spot.nameEn ?? spot.name) : spot.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit">{t("customSubmit")}</Button>
          {state.status === "error" && (
            <p role="alert" className="text-sm text-destructive">
              {t(`errors.${state.code}` as never)}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function ProposalCard({
  actorUserId,
  otherUserId,
  proposal,
  now,
}: {
  actorUserId: string;
  otherUserId: string;
  proposal: ProposalView;
  now: string;
}) {
  const t = useTranslations("Meetup");
  const locale = useLocale();

  const [respondState, respondAction] = useActionState(respondToMeetup, idleAction);
  const [cancelState, cancelAction] = useActionState(cancelMeetup, idleAction);
  const [shareState, shareAction] = useActionState(createShareLink, idleShare);
  const [feedbackState, feedbackAction] = useActionState(submitMeetupFeedback, idleAction);

  useRefreshOnSuccess(respondState);
  useRefreshOnSuccess(cancelState);
  useRefreshOnSuccess(feedbackState);

  const formatter = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", {
    dateStyle: "full",
    timeStyle: "short",
    hourCycle: "h23",
  });
  const isProposer = proposal.proposedByUserId === actorUserId;
  const isPast = new Date(proposal.scheduledEnd).getTime() < new Date(now).getTime();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(`status.${proposal.status}` as never)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="font-medium">{formatter.format(new Date(proposal.scheduledStart))}</p>
        <p className="text-sm text-muted-foreground">
          {locale === "en" ? (proposal.spotNameEn ?? proposal.spotName) : proposal.spotName}
        </p>
        <p className="text-sm">{t("withWhom", { name: proposal.otherFirstName ?? "" })}</p>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-3">
        {respondState.status === "error" && (
          <p role="alert" className="text-sm text-destructive">
            {t(`errors.${respondState.code}` as never)}
          </p>
        )}
        {cancelState.status === "error" && (
          <p role="alert" className="text-sm text-destructive">
            {t(`errors.${cancelState.code}` as never)}
          </p>
        )}

        {proposal.status === "PROPOSED" &&
          (isProposer ? (
            <form action={respondAction}>
              <input type="hidden" name="proposalId" value={proposal.proposalId} />
              <input type="hidden" name="decision" value="DECLINE" />
              <Button type="submit" variant="outline">
                {t("withdraw")}
              </Button>
            </form>
          ) : (
            <div className="flex gap-2">
              <form action={respondAction}>
                <input type="hidden" name="proposalId" value={proposal.proposalId} />
                <input type="hidden" name="decision" value="DECLINE" />
                <Button type="submit" variant="outline">
                  {t("decline")}
                </Button>
              </form>
              <form action={respondAction}>
                <input type="hidden" name="proposalId" value={proposal.proposalId} />
                <input type="hidden" name="decision" value="ACCEPT" />
                <Button type="submit">{t("accept")}</Button>
              </form>
            </div>
          ))}

        {proposal.status === "ACCEPTED" && (
          <>
            <div className="flex flex-wrap gap-2">
              <a
                href={`/api/meetup/${proposal.proposalId}/ics`}
                download
                className={buttonVariants({ variant: "outline" })}
              >
                {t("addToCalendar")}
              </a>
              <form action={shareAction}>
                <input type="hidden" name="proposalId" value={proposal.proposalId} />
                <Button type="submit" variant="outline">
                  {t("sharePlans")}
                </Button>
              </form>
              <form action={cancelAction}>
                <input type="hidden" name="proposalId" value={proposal.proposalId} />
                <Button type="submit" variant="destructive">
                  {t("cancelMeetup")}
                </Button>
              </form>
            </div>
            {shareState.status === "success" && (
              <p className="text-sm break-all text-muted-foreground">
                {t("shareLinkReady")}:{" "}
                {typeof window !== "undefined"
                  ? `${window.location.origin}${shareState.path}`
                  : shareState.path}
              </p>
            )}
            {shareState.status === "error" && (
              <p role="alert" className="text-sm text-destructive">
                {t(`errors.${shareState.code}` as never)}
              </p>
            )}

            {isPast && proposal.myFeedbackResponse === null && (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <p className="text-sm font-medium">{t("feedbackPrompt")}</p>
                {feedbackState.status === "error" && (
                  <p role="alert" className="text-sm text-destructive">
                    {t(`errors.${feedbackState.code}` as never)}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {FEEDBACK_RESPONSES.map((response) => (
                    <form key={response} action={feedbackAction}>
                      <input type="hidden" name="proposalId" value={proposal.proposalId} />
                      <input type="hidden" name="response" value={response} />
                      <Button
                        type="submit"
                        variant={response === "UNCOMFORTABLE" ? "destructive" : "outline"}
                        size="sm"
                      >
                        {t(`feedback.${response}` as never)}
                      </Button>
                    </form>
                  ))}
                </div>
              </div>
            )}
            {isPast && proposal.myFeedbackResponse === "UNCOMFORTABLE" && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <p className="text-sm text-muted-foreground">{t("feedbackUncomfortable")}</p>
                <ReportButton targetUserId={otherUserId} />
              </div>
            )}
            {isPast &&
              proposal.myFeedbackResponse !== null &&
              proposal.myFeedbackResponse !== "UNCOMFORTABLE" && (
                <p className="text-sm text-muted-foreground">{t("feedbackThanks")}</p>
              )}
          </>
        )}
      </CardFooter>
    </Card>
  );
}
