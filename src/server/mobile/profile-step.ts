import type * as z from "zod";
import { prisma } from "@/server/db";
import type { StepResult } from "@/server/profile/service";
import { PROFILE_RATE_LIMIT, stepHandler } from "./profile";
import { enforceRateLimit } from "./rate-limit";
import { mobileRoute } from "./route";

/**
 * Binds a profile step to the real database for a route file: the guard (version, sign-in, active
 * account, account setup finished) around `stepHandler`.
 *
 *   export const PUT = profileStepRoute("profile.intents", profileBodies.intents, (person, data) => saveIntentsStep(prisma, person, data));
 */
export function profileStepRoute<S extends z.ZodType>(
  name: string,
  schema: S,
  run: (person: { userId: string; campusId: string }, data: z.infer<S>) => Promise<StepResult>,
) {
  const handler = stepHandler(schema, run, {
    limit: (key) => enforceRateLimit(prisma, key, PROFILE_RATE_LIMIT),
  });
  return mobileRoute(name, handler, { requireAccountSetup: true });
}
