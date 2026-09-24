import { ShieldCheck } from "lucide-react";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState } from "@/components/states/empty-state";
import { PageHeader } from "@/components/states/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/server/db";
import { getVerificationQueue, type VerificationQueueItem } from "@/server/verification/queries";
import { ReviewForm } from "./review-form";

export default async function AdminVerificationPage({
  params,
}: PageProps<"/[locale]/admin/verification">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Admin");

  const queue = await getVerificationQueue(prisma);

  return (
    <>
      <PageHeader title={t("verificationQueueTitle")} />
      {queue.length === 0 ? (
        <EmptyState icon={ShieldCheck} title={t("empty")} />
      ) : (
        <div className="space-y-4">
          {queue.map((item) => (
            <QueueCard key={item.selfieId} item={item} locale={locale} />
          ))}
        </div>
      )}
    </>
  );
}

async function QueueCard({ item, locale }: { item: VerificationQueueItem; locale: string }) {
  const t = await getTranslations("Admin");
  const submittedAt = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(item.submittedAt);

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium">
              {item.userName}
              {item.campusName ? ` · ${item.campusName}` : ""}
            </p>
            <p className="text-sm text-muted-foreground">{t("submittedAt", { date: submittedAt })}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="aspect-square overflow-hidden rounded-lg bg-muted">
            <Image
              src={item.selfieUrl}
              alt=""
              width={200}
              height={200}
              className="size-full object-cover"
              unoptimized
            />
          </div>
          {item.profile?.photoUrls.map((url) => (
            <div key={url} className="aspect-square overflow-hidden rounded-lg bg-muted">
              <Image src={url} alt="" width={200} height={200} className="size-full object-cover" unoptimized />
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-border p-3 text-sm">
          <p className="font-medium">{t("profileSection")}</p>
          {item.profile ? (
            <p className="text-muted-foreground">
              {[item.profile.firstName, item.profile.gender, item.profile.year, item.profile.major]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : (
            <p className="text-muted-foreground">{t("noProfile")}</p>
          )}
        </div>

        <ReviewForm selfieId={item.selfieId} />
      </CardContent>
    </Card>
  );
}
