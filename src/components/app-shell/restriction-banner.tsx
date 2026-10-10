import { TriangleAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { remainingParts } from "./remaining";

/**
 * Shown on every signed-in page while an account is suspended or banned (G8). The server
 * actions refuse waves, messages and meetups for these accounts regardless; this is the
 * "why, and for how long" for the person it applies to. The time left is computed when the
 * page renders (it does not tick), which is fine for a status measured in days.
 */
export async function RestrictionBanner({
  status,
  suspendedUntil,
  now = new Date(),
}: {
  status: "SUSPENDED" | "BANNED";
  suspendedUntil: Date | null;
  now?: Date;
}) {
  const t = await getTranslations("Restriction");

  let body: string;
  if (status === "BANNED") {
    body = t("bannedBody");
  } else if (suspendedUntil === null) {
    body = t("suspendedBodyNoDate");
  } else {
    const { days, hours, minutes } = remainingParts(suspendedUntil.getTime() - now.getTime());
    const remaining =
      days > 0
        ? t("remainingDaysHours", { days, hours })
        : hours > 0
          ? t("remainingHoursMinutes", { hours, minutes })
          : t("remainingMinutes", { minutes: Math.max(minutes, 1) });
    body = t("suspendedBody", { remaining });
  }

  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-2 rounded-xl border border-warning bg-warning/10 px-4 py-3 text-sm text-foreground"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-medium">{status === "BANNED" ? t("bannedTitle") : t("suspendedTitle")}</p>
        <p>{body}</p>
        <Link href="/me/safety" className="underline">
          {t("details")}
        </Link>
      </div>
    </div>
  );
}
