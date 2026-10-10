import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { PicksPreview } from "./picks-preview";

// Development preview of the swipeable picks, with sample people and stand-in actions (no
// database, no sign-in). Off unless ENABLE_DEV_UI=true, and read at request time.
export const dynamic = "force-dynamic";

export default async function DevPicksPage({ params }: PageProps<"/[locale]/dev/picks">) {
  if (process.env.ENABLE_DEV_UI !== "true") {
    notFound();
  }
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main id="main" className="mx-auto w-full max-w-2xl px-4 py-8">
      <PicksPreview />
    </main>
  );
}
