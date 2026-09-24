"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { reviewSelfie, type ReviewSelfieState } from "@/server/verification/actions";

const initialState: ReviewSelfieState = { status: "idle" };

export function ReviewForm({ selfieId }: { selfieId: string }) {
  const t = useTranslations("Admin");
  const router = useRouter();
  const [state, action] = useActionState(reviewSelfie, initialState);

  // Adjusting state during render (React's documented pattern) instead of an effect —
  // refreshing the server-rendered queue list on success removes the resolved item.
  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    if (state.status === "success") router.refresh();
  }

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="selfieId" value={selfieId} />
      <Textarea name="reason" placeholder={t("reasonPlaceholder")} aria-label={t("reasonLabel")} rows={2} />
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
