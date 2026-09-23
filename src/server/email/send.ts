import { appendFile } from "node:fs/promises";
import path from "node:path";

/**
 * One function every part of the app sends email through. In the local-only phase
 * (RESEND_API_KEY unset), it logs the content to the server console — and appends it
 * to a dev outbox file — instead of delivering anything (see docs/BUILD_PLAN.md S04).
 * Once RESEND_API_KEY is set, it switches to real delivery automatically; nothing
 * calling sendEmail() needs to change.
 *
 * The outbox file (gitignored, dev/CI only) exists because scraping server console
 * output is fragile across dev/CI environments (different process supervisors,
 * stdout buffering). Tests read it directly — see e2e/waitlist.spec.ts.
 */

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
};

export const DEV_OUTBOX_PATH = path.join(process.cwd(), ".dev-outbox.jsonl");

export async function sendEmail({ to, subject, text }: SendEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log(
      `[dev email] to=${to} subject="${subject}"\n${text}\n[dev email] not sent — RESEND_API_KEY is unset (local-only phase)`,
    );
    const line = JSON.stringify({ to, subject, text, sentAt: new Date().toISOString() });
    await appendFile(DEV_OUTBOX_PATH, `${line}\n`, "utf8");
    return;
  }

  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new Error("EMAIL_FROM must be set alongside RESEND_API_KEY.");
  }

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({ from, to, subject, text });
  if (error) {
    throw new Error(`Resend failed to send to ${to}: ${error.message}`);
  }
}
