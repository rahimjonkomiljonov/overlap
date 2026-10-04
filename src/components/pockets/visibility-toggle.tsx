"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useRefreshOnSuccess } from "@/hooks/use-refresh-on-success";
import { setPocketsVisible, type PocketActionState } from "@/server/pockets/actions";

const idle: PocketActionState = { status: "idle" };

/** C7's opt-in: off by default; turning it on is what lets you browse pockets too. */
export function PocketsVisibilityToggle({ visible }: { visible: boolean }) {
  const t = useTranslations("Pockets");
  const [state, action, pending] = useActionState(setPocketsVisible, idle);
  useRefreshOnSuccess(state);

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{t("visibleLabel")}</p>
        <p className="text-sm text-muted-foreground">{t("visibleHint")}</p>
        {state.status === "error" && (
          <p role="alert" className="text-sm text-destructive">
            {t(`errors.${state.code}` as never)}
          </p>
        )}
      </div>
      <form action={action}>
        <input type="hidden" name="visible" value={visible ? "false" : "true"} />
        <Button type="submit" variant={visible ? "outline" : "default"} disabled={pending}>
          {t(visible ? "turnOff" : "turnOn")}
        </Button>
      </form>
    </div>
  );
}
