"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { triggerTestAlert, type TriggerTestAlertState } from "@/server/ops/actions";

const initialState: TriggerTestAlertState = { status: "idle" };

/** S21's forced-error demo: proves an alert actually fires end to end, not just in a unit test. */
export function TriggerAlertButton() {
  const t = useTranslations("AdminOps");
  const tAdmin = useTranslations("Admin");
  const router = useRouter();
  const [state, action] = useActionState(triggerTestAlert, initialState);

  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    if (state.status === "success") router.refresh();
  }

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
