import { getTranslations, setRequestLocale } from "next-intl/server";
import { DraftNotice } from "@/components/draft-notice";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

type Section = { heading: string; body: string };
type ItemRow = { item: string; purpose: string; note: string };
type RetentionRow = { item: string; sensitivity: string; retention: string };
type ProcessorRow = { name: string; sees: string; location: string };

function SimpleTable({ caption, headers, rows }: { caption: string; headers: string[]; rows: string[][] }) {
  return (
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      className="overflow-x-auto rounded-lg border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {headers.map((header) => (
              <th key={header} scope="col" className="px-3 py-2 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 text-muted-foreground">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function PrivacyPage({ params }: PageProps<"/[locale]/privacy">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Legal");
  const sections = Object.values(t.raw("privacy.sections") as Record<string, Section>);
  const itemsTable = Object.values(t.raw("privacy.itemsTable") as Record<string, ItemRow>);
  const retentionTable = Object.values(
    t.raw("privacy.retentionTable") as Record<string, RetentionRow>,
  );
  const processorsTable = Object.values(
    t.raw("privacy.processorsTable") as Record<string, ProcessorRow>,
  );
  const itemsHeaders = t.raw("privacy.itemsHeaders") as string[];
  const retentionHeaders = t.raw("privacy.retentionHeaders") as string[];
  const processorsHeaders = t.raw("privacy.processorsHeaders") as string[];

  return (
    <main id="main" className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <Logo />
      <DraftNotice>{t("draftNotice")}</DraftNotice>
      <h1 className="text-3xl font-semibold tracking-tight">{t("privacyTitle")}</h1>
      <p className="text-muted-foreground">{t("privacy.intro")}</p>

      {sections.map((section) => (
        <section key={section.heading} className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight">{section.heading}</h2>
          <p className="text-muted-foreground">{section.body}</p>
        </section>
      ))}

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">{t("privacy.itemsTableCaption")}</h2>
        <SimpleTable
          caption={t("privacy.itemsTableCaption")}
          headers={itemsHeaders}
          rows={itemsTable.map((row) => [row.item, row.purpose, row.note])}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">{t("privacy.retentionTableCaption")}</h2>
        <SimpleTable
          caption={t("privacy.retentionTableCaption")}
          headers={retentionHeaders}
          rows={retentionTable.map((row) => [row.item, row.sensitivity, row.retention])}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">{t("privacy.processorsTableCaption")}</h2>
        <p className="text-muted-foreground">{t("privacy.processorsIntro")}</p>
        <SimpleTable
          caption={t("privacy.processorsTableCaption")}
          headers={processorsHeaders}
          rows={processorsTable.map((row) => [row.name, row.sees, row.location])}
        />
      </section>

      <section className="space-y-2 rounded-lg border border-border p-4">
        <h2 className="text-xl font-semibold tracking-tight">{t("privacy.rightsHeading")}</h2>
        <p className="text-muted-foreground">{t("privacy.rightsBody")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">{t("privacy.cpoHeading")}</h2>
        <p className="text-muted-foreground">{t("privacy.cpoBody")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">{t("privacy.securityHeading")}</h2>
        <p className="text-muted-foreground">{t("privacy.securityBody")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">{t("privacy.changesHeading")}</h2>
        <p className="text-muted-foreground">{t("privacy.changesBody")}</p>
      </section>

      <div className="flex flex-wrap gap-2">
        <Link href="/terms" className={buttonVariants({ variant: "outline", size: "sm" })}>
          {t("termsTitle")}
        </Link>
        <Link href="/how-matching-works" className={buttonVariants({ variant: "outline", size: "sm" })}>
          {t("privacy.howMatchingWorksLinkCta")}
        </Link>
      </div>
    </main>
  );
}
