/**
 * Redacts sensitive fields from anything on its way to a log line or Sentry event.
 * Matches CLAUDE.md's hard rule: never log or track `interested_in`, selfies, or chat
 * text. Wired into Sentry's beforeSend in S20; used directly by any structured logger
 * before now.
 */

const REDACTED = "[REDACTED]";

/** Key names (case-insensitive, checked as whole segments) that are always redacted. */
export const DEFAULT_SENSITIVE_KEYS = [
  // Dating-specific, from the hard rule.
  "interestedIn",
  "interested_in",
  "selfie",
  "selfieUrl",
  "selfie_url",
  "message",
  "messages",
  "content",
  "chatText",
  "chat_text",
  "text",
  // General credential hygiene, so a stray secret in a payload doesn't leak either.
  "password",
  "token",
  "secret",
  "apiKey",
  "api_key",
  "authorization",
  "cookie",
];

function normalize(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, "");
}

/**
 * Deep-clones `value`, replacing any object property whose key matches a sensitive
 * name with "[REDACTED]". Arrays and nested objects are walked; a WeakSet guards
 * against circular references (real-world log payloads, e.g. Error objects with
 * `.cause`, sometimes have them).
 */
export function scrub<T>(value: T, extraKeys: string[] = []): T {
  const sensitive = new Set([...DEFAULT_SENSITIVE_KEYS, ...extraKeys].map(normalize));
  const seen = new WeakSet<object>();

  function walk(input: unknown): unknown {
    if (input === null || typeof input !== "object") {
      return input;
    }
    if (seen.has(input)) {
      return "[CIRCULAR]";
    }
    seen.add(input);

    if (Array.isArray(input)) {
      return input.map(walk);
    }
    if (input instanceof Date) {
      return input;
    }

    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(input)) {
      result[key] = sensitive.has(normalize(key)) ? REDACTED : walk(val);
    }
    return result;
  }

  return walk(value) as T;
}
