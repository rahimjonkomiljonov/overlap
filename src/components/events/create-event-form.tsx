"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { createEvent, type EventActionState } from "@/server/events/actions";

const idle: EventActionState = { status: "idle" };

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function CreateEventForm({ spots }: { spots: { id: string; name: string }[] }) {
  const t = useTranslations("Events");
  const router = useRouter();
  const [state, action, pending] = useActionState(createEvent, idle);

  // Navigation is a Router update, so it belongs in an effect, never during render.
  useEffect(() => {
    if (state.status === "success" && state.eventId) router.push(`/events/${state.eventId}`);
  }, [state, router]);

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="title">{t("fieldTitle")}</Label>
        <Input id="title" name="title" required minLength={2} maxLength={80} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">{t("fieldDescription")}</Label>
        <Textarea id="description" name="description" required maxLength={1000} rows={4} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="spotId">{t("fieldSpot")}</Label>
        <select id="spotId" name="spotId" required className={selectClass} defaultValue="">
          <option value="" disabled>
            —
          </option>
          {spots.map((spot) => (
            <option key={spot.id} value={spot.id}>
              {spot.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="startsAt">{t("fieldStartsAt")}</Label>
          <Input
            id="startsAt"
            name="startsAt"
            type="datetime-local"
            required
            aria-describedby="timesHint"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endsAt">{t("fieldEndsAt")}</Label>
          <Input
            id="endsAt"
            name="endsAt"
            type="datetime-local"
            required
            aria-describedby="timesHint"
          />
        </div>
      </div>
      <p id="timesHint" className="text-xs text-muted-foreground">
        {t("timesHint")}
      </p>
      <div className="space-y-2">
        <Label htmlFor="capacity">{t("fieldCapacity")}</Label>
        <Input id="capacity" name="capacity" type="number" inputMode="numeric" min={2} max={1000} />
      </div>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors.${state.code}` as never)}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? t("creating") : t("submitCreate")}
      </Button>
    </form>
  );
}
