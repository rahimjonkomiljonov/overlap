import { UserCheck } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState } from "@/components/states/empty-state";
import { PageHeader } from "@/components/states/page-header";
import { prisma } from "@/server/db";
import { getSuspendedUsers } from "@/server/moderation/suspensions";
import { SuspendedUserCard } from "./suspended-user-card";

/** Suspended accounts, one card each, so a moderator picks exactly whom to reinstate. The admin layout already restricts this to moderators. */
export default async function AdminSuspensionsPage({ params }: PageProps<"/[locale]/admin/suspensions">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("AdminSuspensions");

  const users = await getSuspendedUsers(prisma);
  const format = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
    hourCycle: "h23",
  });

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      {users.length === 0 ? (
        <EmptyState icon={UserCheck} title={t("empty")} />
      ) : (
        <div className="space-y-4">
          {users.map((user) => (
            <SuspendedUserCard
              key={user.userId}
              user={{
                userId: user.userId,
                firstName: user.firstName,
                suspendedUntil: user.suspendedUntil ? format.format(user.suspendedUntil) : null,
                suspendedAt: user.suspendedAt ? format.format(user.suspendedAt) : null,
                reason: user.reason,
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}
