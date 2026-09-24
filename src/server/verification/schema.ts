import * as z from "zod";

/** Per-decision validation for the moderator review action (S08/H2). */
export const REJECTION_REASON_MAX_LENGTH = 500;

export const reviewSelfieSchema = z.discriminatedUnion("decision", [
  z.object({
    selfieId: z.string().min(1),
    decision: z.literal("APPROVED"),
    // Optional note for the audit trail; approvals don't need to justify themselves
    // to the user the way a rejection does.
    reason: z.string().trim().max(REJECTION_REASON_MAX_LENGTH).optional(),
  }),
  z.object({
    selfieId: z.string().min(1),
    decision: z.literal("REJECTED"),
    // Required: shown back to the user so they know what to fix before resubmitting.
    reason: z.string().trim().min(1).max(REJECTION_REASON_MAX_LENGTH),
  }),
]);
