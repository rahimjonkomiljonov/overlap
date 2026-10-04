import { Share2 } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ShareCard } from "@/components/share/share-card";
import { EmptyState } from "@/components/states/empty-state";
import { PageHeader } from "@/components/states/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { redirect } from "@/i18n/navigation";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { MIN_SHAREABLE_COUNT } from "@/server/share/buckets";
import { getShareableGroups } from "@/server/share/queries";

/** J5: privacy-safe cards for the viewer's own courses and clubs. */
export default async function SharePage({ params }: PageProps<"/[locale]/share">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Share");

  const actor = await getActor();
  if (!actor) {
    redirect({ href: "/login", locale });
    return;
  }
  const groups = await getShareableGroups(prisma, { userId: actor.userId, campusId: actor.campusId }, locale);

  return (
    <>
      <PageHeader title={t("title")} description={t("description", { min: MIN_SHAREABLE_COUNT })} />
      {groups.length === 0 ? (
        <EmptyState icon={Share2} title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <Card key={`${group.kind}:${group.id}`}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{t(`kind.${group.kind}`)}</Badge>
                  {group.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {group.bucket === null ? (
                  <p className="text-sm text-muted-foreground">{t("tooFew", { min: MIN_SHAREABLE_COUNT })}</p>
                ) : (
                  <ShareCard
                    headline={t(`headline.${group.kind}`, { label: group.label, count: group.bucket })}
                    footer={t("footer")}
                    fileName={`overlap-${group.kind}.png`}
                  />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
