import * as z from "zod";
import { SLIDER_MAX, SLIDER_MIN, SLIDER_STEP } from "@/server/matching/personalize";

const slider = z.coerce.number().min(SLIDER_MIN).max(SLIDER_MAX).multipleOf(SLIDER_STEP);

export const setWeightSlidersSchema = z.object({
  classes: slider,
  interests: slider,
  freeTime: slider,
});
