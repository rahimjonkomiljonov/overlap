import { getTranslations, setRequestLocale } from "next-intl/server";
import { GuestList } from "@/components/events/guest-list";
import { RsvpForm } from "@/components/events/rsvp-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, redirect } from "@/i18n/navigation";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { formatEventTime } from "@/server/events/format";
import { getEventDetail } from "@/server/events/queries";
import { canRsvp } from "@/server/events/rules";

export default async function EventPage({ params }: PageProps<"/[locale]/events/[eventId]">) {
  const { locale, eventId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Events");

  const actor = await getActor();
  const event = actor
    ? await getEventDetail(prisma, eventId, { userId: actor.userId, campusId: actor.campusId })
    : null;
  if (!event) {
    redirect({ href: "/events", locale });
    return;
  }

  const going = event.myRsvp !== null;
  const canConnect = event.phase === "connect" && going && event.viewerVerified;
  const showGuests = event.phase !== "closed" && event.phase !== "cancelled";

  return (
    <div className="space-y-6">
      <Link href="/events" className="text-sm text-muted-foreground hover:text-foreground">
        &larr; {t("backToList")}
      </Link>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={event.phase === "connect" ? "default" : "secondary"}>
            {t(`phase.${event.phase}`)}
          </Badge>
          {going && <Badge variant="outline">{t("youAreGoing")}</Badge>}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{event.title}</h1>
        <p className="text-muted-foreground">
          {formatEventTime(event.startsAt, event.endsAt, locale)} · {event.spotName}
        </p>
        {event.organizerFirstName && (
          <p className="text-sm text-muted-foreground">
            {t("organizer", { name: event.organizerFirstName })}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          {event.capacity
            ? t("goingOfCapacity", { count: event.goingCount, capacity: event.capacity })
            : t("goingCount", { count: event.goingCount })}
        </p>
      </div>

      <p className="whitespace-pre-wrap">{event.description}</p>

      {canRsvp(event.phase) && (
        <Card>
          <CardContent>
            <RsvpForm
              eventId={event.id}
              going={going}
              showInGuestList={event.myRsvp?.showInGuestList ?? false}
            />
          </CardContent>
        </Card>
      )}

      {showGuests && (
        <Card>
          <CardHeader>
            <CardTitle>{t("guestsTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {event.phase === "connect" && going && (
              <p className="text-sm text-muted-foreground">{t("connectHint")}</p>
            )}
            {!event.viewerVerified ? (
              <p className="text-sm text-muted-foreground">{t("verifyToSeeGuests")}</p>
            ) : event.guests.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("guestsEmpty")}</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{t("guestsHint")}</p>
                <GuestList eventId={event.id} guests={event.guests} canConnect={canConnect} />
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
