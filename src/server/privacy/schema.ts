import * as z from "zod";

/**
 * Only the optional/sensitive consent types are withdrawable this way (§15.3):
 * TERMS/PRIVACY_POLICY are required to use the service at all, so there's no
 * self-service "withdraw" for them short of deleting the account.
 */
export const withdrawConsentSchema = z.object({
  type: z.enum(["SENSITIVE_PREFERENCE", "MARKETING", "MARKETING_NIGHT", "OVERSEAS_TRANSFER"]),
});
