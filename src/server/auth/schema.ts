import * as z from "zod";

export const requestLoginOtpSchema = z.object({
  email: z.email(),
});

export const verifyLoginOtpSchema = z.object({
  email: z.email(),
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits."),
});

export const onboardingSchema = z.object({
  birthYear: z.coerce.number().int(),
  // Used for the age check only; never stored (see age-verifier.ts).
  birthMonth: z.coerce.number().int(),
  birthDay: z.coerce.number().int(),
  attestedAdult: z.literal("on", { error: "You must confirm you are 19 or older." }),
  termsPrivacy: z.literal("on", { error: "You must agree to the Terms and Privacy Policy." }),
  // A checked HTML checkbox submits "on"; an unchecked one omits the field entirely.
  sensitivePreference: z.literal("on").optional(),
  // Required only when cohort release is on (checked in completeOnboarding).
  inviteCode: z.string().trim().max(32).optional(),
});
