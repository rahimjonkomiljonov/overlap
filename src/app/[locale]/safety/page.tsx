import { getTranslations, setRequestLocale } from "next-intl/server";
import { DraftNotice } from "@/components/draft-notice";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default async function SafetyPage({ params }: PageProps<"/[locale]/safety">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Safety");

  return (
    <main id="main" className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <Logo />
      <DraftNotice>{t("draftNotice")}</DraftNotice>
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted-foreground">{t("intro")}</p>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">{t("beforeMeetingTitle")}</h2>
        <ul className="list-inside list-disc space-y-2 text-muted-foreground">
          <li>{t("beforeMeetingVerify")}</li>
          <li>{t("beforeMeetingPlanner")}</li>
          <li>{t("beforeMeetingShare")}</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">{t("duringMeetingTitle")}</h2>
        <p className="text-muted-foreground">{t("duringMeetingBody")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">{t("afterMeetingTitle")}</h2>
        <p className="text-muted-foreground">{t("afterMeetingBody")}</p>
      </section>

      <section className="space-y-2 rounded-lg border border-border p-4">
        <h2 className="text-xl font-semibold tracking-tight">{t("reportTitle")}</h2>
        <p className="text-muted-foreground">{t("reportBody")}</p>
        <Link href="/community-guidelines" className={buttonVariants({ variant: "outline", size: "sm" })}>
          {t("communityLinkCta")}
        </Link>
      </section>

      <section className="space-y-2 rounded-lg border border-warning p-4">
        <h2 className="text-xl font-semibold tracking-tight">{t("emergencyTitle")}</h2>
        <ul className="space-y-1 text-muted-foreground">
          <li>{t("emergencyPolice")}</li>
          <li>{t("emergencyAmbulance")}</li>
          <li>{t("emergencyWomen")}</li>
          <li>{t("emergencyDigitalSexCrime")}</li>
        </ul>
        <p className="text-sm text-muted-foreground">{t("emergencyCampus")}</p>
      </section>
    </main>
  );
}
