"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { ReportCategory } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { fileReport, type FileReportState } from "@/server/reports/actions";

const CATEGORIES = [
  ReportCategory.NON_CONSENSUAL_IMAGERY,
  ReportCategory.DEEPFAKE,
  ReportCategory.ILLEGAL_FILMING,
  ReportCategory.HARASSMENT,
  ReportCategory.UNWANTED_CONTACT,
  ReportCategory.SCAM_OR_PHISHING,
  ReportCategory.SPAM,
  ReportCategory.FAKE_PROFILE,
  ReportCategory.INAPPROPRIATE_CONTENT,
  ReportCategory.OTHER,
] as const;

const idleState: FileReportState = { status: "idle" };

/**
 * G1's 2-tap report: tap "report" to reveal this form, pick a category and tap "submit"
 * to file it — reusable from a pick/wave/match card or an open chat thread.
 * `conversationId`, when given, is what lets `fileReport` attach the last 50 messages as
 * evidence (only when the reporter is actually a participant in that conversation with
 * `targetUserId` — re-checked server-side, never trusted from this prop alone).
 */
export function ReportButton({
  targetUserId,
  conversationId,
}: {
  targetUserId: string;
  conversationId?: string;
}) {
  const t = useTranslations("Report");
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(fileReport, idleState);

  if (state.status === "success") {
    return <p className="text-sm text-muted-foreground">{t("thanks")}</p>;
  }

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {t("reportButton")}
      </Button>
    );
  }

  return (
    <form action={action} className="space-y-3 rounded-lg border border-border p-4">
      <input type="hidden" name="targetUserId" value={targetUserId} />
      {conversationId && <input type="hidden" name="conversationId" value={conversationId} />}
      <p className="text-sm font-medium">{t("dialogTitle")}</p>
      <RadioGroup name="category" defaultValue={ReportCategory.OTHER} required>
        {CATEGORIES.map((category) => (
          <label key={category} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <RadioGroupItem value={category} id={`report-category-${category}`} />
            {t(`categories.${category}` as never)}
          </label>
        ))}
      </RadioGroup>
      <Textarea
        name="description"
        placeholder={t("descriptionPlaceholder")}
        aria-label={t("descriptionPlaceholder")}
        rows={2}
      />
      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors.${state.code}` as never)}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
        <Button type="submit" variant="destructive">
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
