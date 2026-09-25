"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { blockUser, type BlockActionState } from "@/server/safety/block-actions";

const idleState: BlockActionState = { status: "idle" };

/** G2: block = mutual invisibility, permanent until undone from /me/safety. A confirm step, not a one-tap destructive action — same pattern as MatchCard's unmatch. */
export function BlockButton({ targetUserId, onBlocked }: { targetUserId: string; onBlocked?: () => void }) {
  const t = useTranslations("Report");
  const [confirming, setConfirming] = useState(false);
  const [state, action] = useActionState(blockUser, idleState);

  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    if (state.status === "success") onBlocked?.();
  }

  if (state.status === "success") {
    return <p className="text-sm text-muted-foreground">{t("blocked")}</p>;
  }

  if (!confirming) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        {t("blockButton")}
      </Button>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="targetUserId" value={targetUserId} />
      <p className="text-sm text-muted-foreground">{t("blockConfirm")}</p>
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        {t("cancel")}
      </Button>
      <Button type="submit" variant="destructive" size="sm">
        {t("blockButton")}
      </Button>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors.${state.code}` as never)}
        </p>
      )}
    </form>
  );
}
