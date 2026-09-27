import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * S21's local substitute for Sentry alerting. CLAUDE.md's local-only-phase rule names
 * Sentry as a flat "no" (unlike sendEmail()/Storage, which get a real-service-when-
 * configured fallback) — O3 confirms it stays paused until "publish". So this doesn't
 * install any SDK; it's the plain local record `captureError()` (src/server/logging.ts)
 * writes to, and the admin ops dashboard (/admin/ops) reads from, so "an error happened"
 * is actually visible somewhere in this phase instead of only scrolling server logs.
 * Same shape as sendEmail()'s dev outbox: a gitignored JSONL file, append-only.
 */

// process.cwd() read per call, not cached in a module-level constant — same reasoning as
// src/server/storage/blob.ts's devStoragePath(): a module-load-time constant would bind
// to whichever cwd was current when this module first got imported, not whatever cwd a
// test later chdir()s into, silently pointing every call at the real repo directory
// instead of a test's isolated scratch dir.
function alertsPath(): string {
  return path.join(process.cwd(), ".dev-alerts.jsonl");
}

export interface AlertRecord {
  context: string;
  message: string;
  extra?: Record<string, unknown>;
  at: string;
}

export async function recordAlert(alert: Omit<AlertRecord, "at">): Promise<void> {
  const entry: AlertRecord = { ...alert, at: new Date().toISOString() };
  await appendFile(alertsPath(), JSON.stringify(entry) + "\n", "utf8");
}

/** Most recent first — the dashboard shows what broke most recently, not a full history. */
export async function getRecentAlerts(limit = 20): Promise<AlertRecord[]> {
  try {
    const content = await readFile(alertsPath(), "utf8");
    const entries: AlertRecord[] = content
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    return entries.slice(-limit).reverse();
  } catch {
    return [];
  }
}
