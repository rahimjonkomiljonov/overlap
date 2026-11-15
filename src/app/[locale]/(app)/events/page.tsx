import { CalendarDays } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState } from "@/components/states/empty-state";
import { PageHeader } from "@/components/states/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { can, Role } from "@/server/auth/authz";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { formatEventTime } from "@/server/events/format";
import { listEvents } from "@/server/events/queries";

export default async function EventsPage({ params }: PageProps<"/[locale]/events">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Events");
  const tNav = await getTranslations("Nav");

  // The (app) layout already redirects signed-out/not-yet-onboarded visitors.
  const actor = await getActor();
  const events = actor
    ? await listEvents(prisma, { userId: actor.userId, campusId: actor.campusId })
    : [];
  const canCreate = can(actor, Role.AMBASSADOR);

  return (
    <>
      <PageHeader backHref="/picks" backLabel={tNav("picks")}
        title={t("title")}
        description={t("description")}
        action={
          canCreate ? (
            <Link href="/events/new" className={buttonVariants({ size: "sm" })}>
              {t("create")}
            </Link>
          ) : undefined
        }
      />
      {events.length === 0 ? (
        <EmptyState icon={CalendarDays} title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <ul className="space-y-3">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={`/events/${event.id}`}
                className="block rounded-xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Card className="transition-colors hover:bg-muted/50">
                  <CardContent className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={event.phase === "connect" ? "default" : "secondary"}>
                        {t(`phase.${event.phase}`)}
                      </Badge>
                      {event.imGoing && <Badge variant="outline">{t("youAreGoing")}</Badge>}
                    </div>
                    <h2 className="text-lg font-semibold">{event.title}</h2>
                    <p className="text-sm text-muted-foreground">
                      {formatEventTime(event.startsAt, event.endsAt, locale)} · {event.spotName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {event.capacity
                        ? t("goingOfCapacity", {
                            count: event.goingCount,
                            capacity: event.capacity,
                          })
                        : t("goingCount", { count: event.goingCount })}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
