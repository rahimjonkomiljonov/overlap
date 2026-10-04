import * as z from "zod";

/**
 * Server-only environment variables, validated once at import time so a missing or
 * malformed value fails loudly at startup instead of surfacing as a confusing crash
 * deep inside a request handler. Never import this from client components.
 *
 * Field-encryption keys (FIELD_ENCRYPTION_KEY_V*) are validated separately in
 * src/server/privacy/encryption.ts, since there can be any number of them.
 */
const schema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url(),
  DATABASE_URL: z.url(),
  EMAIL_HASH_PEPPER: z.string().min(32, "EMAIL_HASH_PEPPER must be at least 32 characters"),
  CRON_SECRET: z.string().min(16, "CRON_SECRET must be at least 16 characters"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  SUPABASE_SECRET_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.email().optional(),
  SENTRY_DSN: z.url().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
});

function loadEnv() {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    throw new Error(
      `Invalid or missing environment variables:\n${z.prettifyError(result.error)}\n\nCheck .env.local against .env.example.`,
    );
  }
  return result.data;
}

let cached: z.infer<typeof schema> | undefined;

/** Lazily validated so importing this module in a script or test never runs it unused. */
export function getEnv() {
  if (!cached) {
    cached = loadEnv();
  }
  return cached;
}
