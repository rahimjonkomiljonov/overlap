import * as z from "zod";
import { WAVE_NOTE_MAX_LENGTH } from "@/server/picks/schema";

export const setPocketsVisibleSchema = z.object({ visible: z.enum(["true", "false"]) });

export const pocketWaveSchema = z.object({
  kind: z.enum(["course", "club"]),
  pocketId: z.string().min(1).max(64),
  toUserId: z.string().min(1).max(64),
  note: z.string().trim().max(WAVE_NOTE_MAX_LENGTH).optional(),
});
