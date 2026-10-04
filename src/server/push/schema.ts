import * as z from "zod";

/** `PushSubscription.toJSON()` as the browser sends it. Only https push-service endpoints. */
export const savePushSubscriptionSchema = z.object({
  endpoint: z
    .url()
    .max(2048)
    .refine((u) => u.startsWith("https://"), "endpoint must be https"),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
});

export const removePushSubscriptionSchema = z.object({
  endpoint: z.string().min(1).max(2048),
});
