import { getTranslations, setRequestLocale } from "next-intl/server";
import { Logo } from "@/components/logo";
import { prisma } from "@/server/db";
import { getShareLinkView } from "@/server/meetup/queries";

/**
 * E3's "share my plans" link — public, no auth, meant for a trusted contact who is never
 * a signed-in Overlap user. Shows only first name, place and time as text (never GPS/
 * live location). An expired/revoked link and a token that never existed render the
 * exact same "unavailable" state (getShareLinkView's own doc comment) so a guessed token
 * can't distinguish the two.
 */
export default async function PlanSharePage({ params }: PageProps<"/[locale]/plan/[token]">) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("PlanShare");

  const view = await getShareLinkView(prisma, token);
  const unavailable = !view || view.expired;

  return (
    <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-10">
      <Logo />
      {unavailable ? (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">{t("unavailableTitle")}</h1>
          <p className="text-muted-foreground">{t("unavailableBody")}</p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("intro", { name: view!.otherFirstName ?? t("someone") })}</p>
          <div className="space-y-1 rounded-lg border border-border p-4">
            <p className="font-medium">
              {new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", {
                dateStyle: "full",
                timeStyle: "short",
                hourCycle: "h23",
              }).format(view!.scheduledStart)}
            </p>
            <p className="text-muted-foreground">
              {locale === "en" ? view!.spotNameEn ?? view!.spotName : view!.spotName}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">{t("noLocationNote")}</p>
        </>
      )}
    </main>
  );
}
