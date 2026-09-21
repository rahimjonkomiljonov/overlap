import { SearchX } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/states/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("States");

  return (
    <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4">
      <EmptyState
        icon={SearchX}
        title={t("notFoundTitle")}
        description={t("notFoundBody")}
        action={
          <Link href="/" className={buttonVariants()}>
            {t("backHome")}
          </Link>
        }
      />
    </main>
  );
}
