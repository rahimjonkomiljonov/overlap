import { Users } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState } from "@/components/states/empty-state";
import { PageHeader } from "@/components/states/page-header";
import { PocketsVisibilityToggle } from "@/components/pockets/visibility-toggle";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getMyPockets } from "@/server/pockets/queries";

export default async function PocketsPage({ params }: PageProps<"/[locale]/pockets">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Pockets");
  const tNav = await getTranslations("Nav");

  // The (app) layout already redirects signed-out/not-yet-onboarded visitors.
  const actor = await getActor();
  const mine = actor
    ? await getMyPockets(prisma, { userId: actor.userId, campusId: actor.campusId }, locale)
    : null;

  const notice = !mine
    ? null
    : !mine.verified
      ? t("verifyFirst")
      : !mine.hasPocketIntent
        ? t("needsIntent")
        : !mine.visible
          ? t("turnOnToBrowse")
          : null;

  return (
    <>
      <PageHeader backHref="/picks" backLabel={tNav("picks")} title={t("title")} description={t("description")} />
      <div className="space-y-6">
        <Card>
          <CardContent className="space-y-3">
            <PocketsVisibilityToggle visible={mine?.visible ?? false} />
            {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
          </CardContent>
        </Card>

        {!mine || mine.pockets.length === 0 ? (
          <EmptyState icon={Users} title={t("emptyTitle")} description={t("emptyBody")} />
        ) : (
          <ul className="space-y-3">
            {mine.pockets.map((pocket) => (
              <li key={`${pocket.kind}:${pocket.id}`}>
                <Link
                  href={`/pockets/${pocket.kind}/${pocket.id}`}
                  className="block rounded-xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Card className="transition-colors hover:bg-muted/50">
                    <CardContent className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className={pocket.kind === "course" ? "h-11 w-1.5 shrink-0 rounded-full bg-you" : "h-11 w-1.5 shrink-0 rounded-full bg-them"}
                      />
                      <div className="min-w-0 flex-1">
                        <Badge variant="secondary">{t(`kind.${pocket.kind}`)}</Badge>
                        <p className="mt-1.5 truncate font-semibold">{pocket.label}</p>
                      </div>
                      <p className="shrink-0 text-sm text-muted-foreground">
                        {t("memberCount", { count: pocket.memberCount })}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
