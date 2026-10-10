import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/states/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link, redirect } from "@/i18n/navigation";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { majorLabel } from "@/server/profile/majors";
import { getMatchedProfile } from "@/server/profile/matched-profile";

/**
 * Another person's profile, reachable only from a match (chat header, matches list). The
 * query returns nothing unless the two are actively matched and not blocked, so this page
 * redirects instead of explaining why: a guessed id reveals nothing.
 */
export default async function PersonProfilePage({ params }: PageProps<"/[locale]/profile/[userId]">) {
  const { locale, userId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("PersonProfile");

  const actor = await getActor();
  if (!actor) {
    redirect({ href: "/login", locale });
    return;
  }

  const profile = await getMatchedProfile(prisma, actor.userId, userId);
  if (!profile) {
    redirect({ href: "/matches", locale });
    return;
  }

  const subtitle = [profile.major ? majorLabel(profile.major, locale) : null, profile.year ? `${profile.year}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <PageHeader title={profile.firstName ?? t("unnamed")} description={subtitle || undefined} />
      <div className="space-y-4">
        {profile.photos.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {profile.photos.map((photo) => (
              <div key={photo.id} className="relative aspect-square overflow-hidden rounded-xl bg-muted">
                <Image src={photo.url} alt="" fill sizes="(min-width: 768px) 25vw, 50vw" className="object-cover" unoptimized />
              </div>
            ))}
          </div>
        )}

        {profile.prompts.length > 0 && (
          <Card>
            <CardContent className="space-y-3">
              {profile.prompts.map((prompt) => (
                <div key={prompt.id} className="rounded-lg border border-border p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    {locale === "en" ? prompt.textEn : prompt.textKo}
                  </p>
                  <p className="text-sm">{prompt.answer}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {profile.interests.length > 0 && (
          <Card>
            <CardContent className="space-y-2">
              <p className="text-sm font-medium">{t("interests")}</p>
              <div className="flex flex-wrap gap-1">
                {profile.interests.map((interest) => (
                  <Badge key={interest.id} variant="secondary">
                    {locale === "en" ? interest.labelEn : interest.labelKo}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-wrap gap-2">
          {profile.conversationId && (
            <Link href={`/matches/${profile.conversationId}`} className={buttonVariants()}>
              {t("chat")}
            </Link>
          )}
          <Link href="/matches" className={buttonVariants({ variant: "outline" })}>
            {t("back")}
          </Link>
        </div>
      </div>
    </>
  );
}
