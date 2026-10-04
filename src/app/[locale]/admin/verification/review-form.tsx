"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { reviewSelfie, type ReviewSelfieState } from "@/server/verification/actions";
import { useRefreshOnSuccess } from "@/hooks/use-refresh-on-success";

const initialState: ReviewSelfieState = { status: "idle" };

export function ReviewForm({ selfieId }: { selfieId: string }) {
  const t = useTranslations("Admin");
  const [state, action] = useActionState(reviewSelfie, initialState);

  // Refreshing the server-rendered queue list on success removes the resolved item.
  useRefreshOnSuccess(state);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="selfieId" value={selfieId} />
      <Textarea
        name="reason"
        placeholder={t("reasonPlaceholder")}
        aria-label={t("reasonLabel")}
        rows={2}
      />
      <div className="flex gap-2">
        <Button type="submit" name="decision" value="APPROVED">
          {t("approve")}
        </Button>
        <Button type="submit" name="decision" value="REJECTED" variant="destructive">
          {t("reject")}
        </Button>
      </div>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors.${state.code}` as never)}
        </p>
      )}
    </form>
  );
}
