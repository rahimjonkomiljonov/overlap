import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/states/page-header";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export default async function MePage({ params }: PageProps<"/[locale]/me">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Me");
  const otherLocale = routing.locales.find((l) => l !== locale) ?? routing.defaultLocale;

  return (
    <>
      <PageHeader title={t("title")} />
      <Card>
        <CardHeader>
          <CardTitle>{t("display")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("theme")}</p>
            <ThemeToggle />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("language")}</p>
            <Link
              href="/me"
              locale={otherLocale}
              className={buttonVariants({ variant: "outline" })}
            >
              {t("switchLanguage")}
            </Link>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
