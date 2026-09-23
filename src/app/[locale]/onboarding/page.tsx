import { getTranslations, setRequestLocale } from "next-intl/server";
import { Logo } from "@/components/logo";
import { redirect } from "@/i18n/navigation";
import { getActor, needsOnboarding } from "@/server/auth/session";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage({ params }: PageProps<"/[locale]/onboarding">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const actor = await getActor();
  if (!actor) {
    redirect({ href: "/login", locale });
  }
  if (!needsOnboarding(actor)) {
    redirect({ href: "/picks", locale });
  }

  const t = await getTranslations("Onboarding");

  return (
    <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-4 py-10">
      <Logo />
      <h1 className="text-center text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <OnboardingForm />
    </main>
  );
}
