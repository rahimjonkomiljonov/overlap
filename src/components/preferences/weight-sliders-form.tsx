"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useRefreshOnSuccess } from "@/hooks/use-refresh-on-success";
import { SLIDER_MAX, SLIDER_MIN, SLIDER_STEP, type WeightSliders } from "@/server/matching/personalize";
import { setWeightSliders, type PreferencesState } from "@/server/preferences/actions";

const idle: PreferencesState = { status: "idle" };
const KEYS = ["classes", "interests", "freeTime"] as const;

/** B11: three "what matters to me" sliders, five stops each, saved together. */
export function WeightSlidersForm({ initial }: { initial: WeightSliders }) {
  const t = useTranslations("MatchingPreferences");
  const [state, action, pending] = useActionState(setWeightSliders, idle);
  const [values, setValues] = useState<WeightSliders>(initial);
  useRefreshOnSuccess(state);

  const stopLabel = (value: number) => t(`stop_${String(value).replace(".", "_")}` as never);

  return (
    <form action={action} className="space-y-6">
      {KEYS.map((key) => (
        <div key={key} className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor={`slider-${key}`}>{t(`${key}Label`)}</Label>
            <span className="text-sm text-muted-foreground" aria-hidden>
              {stopLabel(values[key])}
            </span>
          </div>
          <input
            id={`slider-${key}`}
            name={key}
            type="range"
            min={SLIDER_MIN}
            max={SLIDER_MAX}
            step={SLIDER_STEP}
            value={values[key]}
            aria-valuetext={stopLabel(values[key])}
            onChange={(e) => setValues((v) => ({ ...v, [key]: Number(e.target.value) }))}
            className="h-11 w-full cursor-pointer accent-primary"
          />
          <p className="text-xs text-muted-foreground">{t(`${key}Hint`)}</p>
        </div>
      ))}
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
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {t("save")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => setValues({ classes: 1, interests: 1, freeTime: 1 })}
        >
          {t("reset")}
        </Button>
      </div>
    </form>
  );
}
