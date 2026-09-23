import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins";
import { prisma } from "@/server/db";
import { getEnv } from "@/server/env";
import { sendEmail } from "@/server/email/send";
import { OTP_TTL_SECONDS } from "./otp";

// Fails loudly at startup if BETTER_AUTH_SECRET/BETTER_AUTH_URL are missing, instead of
// Better Auth silently falling back to an insecure default secret (it only warns).
const env = getEnv();

/**
 * Better Auth manages identity (name/email/emailVerified/image), sessions and OTP
 * verification tokens on the `User`/`Session`/`Account`/`Verification` tables — see the
 * comment on the User model in prisma/schema.prisma for why those fields live directly
 * on our own schema rather than a separate auth database.
 *
 * Chosen over Supabase Auth (docs/BUILD_PLAN.md S05 log): Supabase Auth sends its own
 * OTP emails through its own infrastructure by default, which would send real email in
 * the local-only phase; doing it ourselves would need a deployed Edge Function plus
 * dashboard configuration. Better Auth's emailOTP plugin takes a plain callback, so it
 * reuses our existing sendEmail() (console/outbox fallback) with no extra infra.
 *
 * Domain allowlisting is NOT done here via a hook: our own server actions
 * (src/server/auth/actions.ts) check resolveCampusForEmail() before ever calling
 * Better Auth's send-OTP API, the same pattern already used for the waitlist.
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  emailAndPassword: { enabled: false },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days; fine for Month-1 traffic
  },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: OTP_TTL_SECONDS,
      async sendVerificationOTP({ email, otp }) {
        await sendEmail({
          to: email,
          subject: "Overlap sign-in code",
          text: `Your Overlap sign-in code is ${otp}. It expires in 10 minutes.`,
        });
      },
    }),
    // Must be last: makes auth.api.* calls from Server Actions set cookies via
    // next/headers automatically instead of silently doing nothing.
    nextCookies(),
  ],
});
