import { readFile } from "node:fs/promises";
import path from "node:path";

// Mirrors src/server/email/send.ts's DEV_OUTBOX_PATH; kept separate so this helper has
// no dependency on server-only code.
const OUTBOX_PATH = path.join(process.cwd(), ".dev-outbox.jsonl");

type OutboxEntry = { to: string; subject: string; text: string; sentAt: string };

/**
 * Reads the 6-digit OTP code most recently "sent" (logged to the dev outbox) to
 * `email`, optionally only counting entries sent after `after`. Most callers use a
 * unique, freshly generated email per attempt, where the most recent entry is
 * unambiguous — but a test that signs in twice with the *same* email (e.g. sign out,
 * then sign back in) needs `after` set to the instant right before requesting the
 * second code, or this could return the earlier, now-stale one instead of waiting for
 * the new entry to actually be written.
 */
export async function readLastOtpCode(
  email: string,
  options: { timeoutMs?: number; after?: Date } = {},
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const content = await readFile(OUTBOX_PATH, "utf8");
      const entries: OutboxEntry[] = content
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      const match = entries
        .filter((e) => e.to === email && (!options.after || new Date(e.sentAt) > options.after))
        .pop();
      const code = match?.text.match(/code is (\d{6})/)?.[1];
      if (code) return code;
    } catch {
      // File may not exist yet on the very first send of a test run; keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`No OTP code found in dev outbox for ${email} within ${timeoutMs}ms`);
}

export function uniqueTestEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.ac.kr`;
}
