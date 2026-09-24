import * as z from "zod";
import { WAVE_NOTE_MAX_LENGTH } from "@/server/picks/schema";

export const waveBackSchema = z.object({
  waveId: z.string().min(1),
  note: z.string().trim().max(WAVE_NOTE_MAX_LENGTH).optional(),
});

export const declineWaveSchema = z.object({
  waveId: z.string().min(1),
});

export const unmatchSchema = z.object({
  matchId: z.string().min(1),
});
