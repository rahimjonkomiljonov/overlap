import { readFile } from "node:fs/promises";
import path from "node:path";

// Mirrors src/server/email/send.ts's DEV_OUTBOX_PATH; kept separate so this helper has
// no dependency on server-only code.
const OUTBOX_PATH = path.join(process.cwd(), ".dev-outbox.jsonl");

type OutboxEntry = { to: string; subject: string; text: string; sentAt: string };

/**
 * Reads the 6-digit OTP code most recently "sent" (logged to the dev outbox) to
 * `email`. Each test uses a unique, freshly generated email, so the most recent entry
 * for it is unambiguous — no need to reset the file between tests.
 */
export async function readLastOtpCode(email: string, timeoutMs = 5000): Promise<string> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const content = await readFile(OUTBOX_PATH, "utf8");
      const entries: OutboxEntry[] = content
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      const match = entries.filter((e) => e.to === email).pop();
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
