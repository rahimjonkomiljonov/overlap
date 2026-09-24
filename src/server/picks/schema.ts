import * as z from "zod";

export const WAVE_NOTE_MAX_LENGTH = 140;

export const targetElementSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("photo"), photoId: z.string().min(1) }),
  z.object({ type: z.literal("promptAnswer"), promptAnswerId: z.string().min(1) }),
  z.object({ type: z.literal("profile") }),
]);
export type TargetElement = z.infer<typeof targetElementSchema>;

export const sendWaveSchema = z.object({
  batchItemId: z.string().min(1),
  targetElement: targetElementSchema,
  note: z.string().trim().max(WAVE_NOTE_MAX_LENGTH).optional(),
});

export const passPickSchema = z.object({
  batchItemId: z.string().min(1),
});
