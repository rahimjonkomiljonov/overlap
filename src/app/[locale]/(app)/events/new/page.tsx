import { getTranslations, setRequestLocale } from "next-intl/server";
import { CreateEventForm } from "@/components/events/create-event-form";
import { PageHeader } from "@/components/states/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { redirect } from "@/i18n/navigation";
import { can, Role } from "@/server/auth/authz";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { listSafeSpots } from "@/server/events/queries";

export default async function NewEventPage({ params }: PageProps<"/[locale]/events/new">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Events");

  // Organizers only (F1). createEvent re-checks this itself; this just avoids showing a
  // form that would always be refused.
  const actor = await getActor();
  if (!actor || !can(actor, Role.AMBASSADOR)) {
    redirect({ href: "/events", locale });
    return;
  }
  const spots = await listSafeSpots(prisma, actor.campusId);

  return (
    <>
      <PageHeader title={t("newTitle")} />
      <Card>
        <CardContent>
          {spots.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noSafeSpots")}</p>
          ) : (
            <CreateEventForm spots={spots} />
          )}
        </CardContent>
      </Card>
    </>
  );
}
