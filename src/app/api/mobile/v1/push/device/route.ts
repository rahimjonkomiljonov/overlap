import { prisma } from "@/server/db";
import { PUSH_WRITE_RATE_LIMIT, registerDeviceHandler, unregisterDeviceHandler } from "@/server/mobile/push";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { mobileRoute } from "@/server/mobile/route";
import { registerDeviceStep, unregisterDeviceStep } from "@/server/push/service";

const limit = (key: string) => enforceRateLimit(prisma, key, PUSH_WRITE_RATE_LIMIT);

/** Save this phone's Expo push token (switch push on). */
export const PUT = mobileRoute(
  "push.register",
  (context) => registerDeviceHandler(context, { limit, register: (person, token) => registerDeviceStep(prisma, person, token) }),
  { requireAccountSetup: true },
);

/** Forget this phone's token (switch push off). */
export const DELETE = mobileRoute(
  "push.unregister",
  (context) => unregisterDeviceHandler(context, { limit, unregister: (person, token) => unregisterDeviceStep(prisma, person, token) }),
  { requireAccountSetup: true },
);
