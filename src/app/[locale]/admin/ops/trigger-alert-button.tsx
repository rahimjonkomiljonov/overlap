"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { triggerTestAlert, type TriggerTestAlertState } from "@/server/ops/actions";
import { useRefreshOnSuccess } from "@/hooks/use-refresh-on-success";

const initialState: TriggerTestAlertState = { status: "idle" };

/** S21's forced-error demo: proves an alert actually fires end to end, not just in a unit test. */
export function TriggerAlertButton() {
  const t = useTranslations("AdminOps");
  const tAdmin = useTranslations("Admin");
  const [state, action] = useActionState(triggerTestAlert, initialState);

  useRefreshOnSuccess(state);

  return (
    <form action={action} className="space-y-2">
      <Button type="submit" variant="outline" size="sm">
        {t("alerts.trigger")}
      </Button>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {tAdmin(`errors.${state.code}` as never)}
        </p>
      )}
    </form>
  );
}
