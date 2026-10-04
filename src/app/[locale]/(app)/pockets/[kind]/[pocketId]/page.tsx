import { getTranslations, setRequestLocale } from "next-intl/server";
import { PocketMemberList } from "@/components/pockets/member-list";
import { Card, CardContent } from "@/components/ui/card";
import { Link, redirect } from "@/i18n/navigation";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getPocket } from "@/server/pockets/queries";

export default async function PocketPage({
  params,
}: PageProps<"/[locale]/pockets/[kind]/[pocketId]">) {
  const { locale, kind, pocketId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Pockets");

  const actor = await getActor();
  const pocket =
    actor && (kind === "course" || kind === "club")
      ? await getPocket(
          prisma,
          { userId: actor.userId, campusId: actor.campusId },
          kind,
          pocketId,
          locale,
        )
      : null;
  if (!pocket || (kind !== "course" && kind !== "club")) {
    redirect({ href: "/pockets", locale });
    return;
  }

  const canBrowse = pocket.verified && pocket.visible && pocket.hasPocketIntent;

  return (
    <div className="space-y-6">
      <Link href="/pockets" className="text-sm text-muted-foreground hover:text-foreground">
        &larr; {t("backToList")}
      </Link>
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{t(`kind.${kind}`)}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{pocket.label}</h1>
      </div>
      <Card>
        <CardContent className="space-y-3">
          {!canBrowse ? (
            <p className="text-sm text-muted-foreground">{t("turnOnToBrowse")}</p>
          ) : pocket.members.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("pocketEmpty")}</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{t("pocketHint")}</p>
              <PocketMemberList kind={kind} pocketId={pocketId} members={pocket.members} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
