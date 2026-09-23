import * as z from "zod";

export const requestOtpSchema = z.object({
  email: z.email(),
  // A checked HTML checkbox submits the literal string "on".
  consent: z.literal("on", { error: "Consent is required." }),
  ref: z.string().optional(),
});

export const verifyOtpSchema = z.object({
  waitlistId: z.uuid(),
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits."),
});
