import { auth } from "@/server/auth/auth";
import { prisma } from "@/server/db";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { DELETE_RATE_LIMIT, deleteAccountHandler } from "@/server/mobile/privacy";
import { mobileRoute } from "@/server/mobile/route";
import { requestAccountDeletionStep } from "@/server/privacy/service";

/**
 * Account deletion, in two phases: this flips the account to DELETED and signs every session out right away; the personal
 * data is scrubbed 30 days later by the retention job, never here. Open to a restricted account.
 */
export const POST = mobileRoute(
  "privacy.delete",
  (context) =>
    deleteAccountHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, DELETE_RATE_LIMIT),
      deleteAccount: (person, headers) =>
        requestAccountDeletionStep(prisma, person, { signOut: async () => void (await auth.api.revokeSessions({ headers })) }),
    }),
  { allowRestricted: true },
);
