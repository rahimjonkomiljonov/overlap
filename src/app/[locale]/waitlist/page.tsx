import { getTranslations, setRequestLocale } from "next-intl/server";
import { Logo } from "@/components/logo";
import { getWaitlistCount } from "@/server/waitlist/actions";
import { WaitlistForm } from "./waitlist-form";

export default async function WaitlistPage({
  params,
  searchParams,
}: PageProps<"/[locale]/waitlist">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { ref } = await searchParams;
  const t = await getTranslations("Waitlist");
  const initialCount = await getWaitlistCount();

  return (
    <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-4 py-10">
      <Logo />
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>
      <WaitlistForm
        initialCount={initialCount}
        referralCode={typeof ref === "string" ? ref : undefined}
      />
    </main>
  );
}
