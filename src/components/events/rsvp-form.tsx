"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useRefreshOnSuccess } from "@/hooks/use-refresh-on-success";
import { setRsvp, type EventActionState } from "@/server/events/actions";

const idle: EventActionState = { status: "idle" };

/** F1 RSVP plus the separate F2 "show me in the guest list" opt-in. */
export function RsvpForm({
  eventId,
  going,
  showInGuestList,
}: {
  eventId: string;
  going: boolean;
  showInGuestList: boolean;
}) {
  const t = useTranslations("Events");
  const [state, action, pending] = useActionState(setRsvp, idle);
  useRefreshOnSuccess(state);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="eventId" value={eventId} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">{t("rsvpLegend")}</legend>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
          <Checkbox
            name="showInGuestList"
            value="on"
            defaultChecked={showInGuestList}
            className="mt-0.5"
          />
          <span>
            <span className="block text-sm">{t("showMe")}</span>
            <span className="block text-xs text-muted-foreground">{t("showMeHint")}</span>
          </span>
        </label>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="going" value="yes" disabled={pending}>
          {pending ? t("saving") : going ? t("save") : t("going")}
        </Button>
        {going && (
          <Button type="submit" name="going" value="no" variant="outline" disabled={pending}>
            {t("notGoing")}
          </Button>
        )}
      </div>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors.${state.code}` as never)}
        </p>
      )}
      {state.status === "success" && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("saved")}
        </p>
      )}
    </form>
  );
}
