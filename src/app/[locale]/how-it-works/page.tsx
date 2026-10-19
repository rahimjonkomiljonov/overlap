import { ShieldCheck } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const STEPS = ["step1", "step2", "step3"] as const;

export default async function HowItWorksPage({ params }: PageProps<"/[locale]/how-it-works">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("HowItWorks");
  const home = await getTranslations("Home");

  return (
    <main id="main" className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <Logo />
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted-foreground">{t("intro")}</p>

      <ol className="space-y-6">
        {STEPS.map((step, index) => (
          <li key={step} className="grid grid-cols-[2.5rem_1fr] gap-x-3">
            <span aria-hidden="true" className="text-3xl leading-none font-semibold text-primary tabular-nums">
              {index + 1}
            </span>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">{t(`${step}Title`)}</h2>
              <p className="max-w-prose text-muted-foreground">{t(`${step}Body`)}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="flex items-start gap-3 rounded-2xl bg-accent px-5 py-4 text-accent-foreground">
        <ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div className="space-y-1">
          <h2 className="font-semibold">{home("safetyTitle")}</h2>
          <p className="max-w-prose text-sm">{home("safetyBody")}</p>
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/waitlist" className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}>
          {t("ctaWaitlist")}
        </Link>
        <Link href="/how-matching-works" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full sm:w-auto")}>
          {t("ctaDetails")}
        </Link>
      </div>
    </main>
  );
}
