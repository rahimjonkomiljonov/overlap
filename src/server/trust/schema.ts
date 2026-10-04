import * as z from "zod";

export const TRUST_APPEAL_NOTE_MAX_LENGTH = 1000;
export const TRUST_RESPONSE_MAX_LENGTH = 1000;

export const submitTrustAppealSchema = z.object({
  note: z.string().trim().min(10).max(TRUST_APPEAL_NOTE_MAX_LENGTH),
});

/** A human decision always comes with a stated response (G10, PIPA Art. 37-2). */
export const reviewTrustAppealSchema = z.object({
  appealId: z.uuid(),
  decision: z.enum(["ACCEPTED", "REJECTED"]),
  response: z.string().trim().min(1).max(TRUST_RESPONSE_MAX_LENGTH),
});
