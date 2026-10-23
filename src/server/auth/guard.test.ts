import { describe, expect, it, vi } from "vitest";
import { EMAIL_CODE_PATHS, guardAuthRequest, SEND_RATE_LIMIT, type AuthGuardDb } from "./guard";

const campus = { id: "campus-1", name: "Gachon University Global Campus" };

/** Fake EmailDomain and RateLimit tables. Every domain in `domains` is allowed. */
function fakeDb(domains: string[] = ["gachon.ac.kr"]) {
  const limits = new Map<string, { key: string; count: number; windowEnds: Date }>();
  const db = {
    emailDomain: { findUnique: vi.fn(async ({ where }: { where: { domain: string } }) => (domains.includes(where.domain) ? { domain: where.domain, campus } : null)) },
    rateLimit: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => limits.get(where.key) ?? null),
      upsert: vi.fn(async ({ where, create }: { where: { key: string }; create: { key: string; count: number; windowEnds: Date } }) => { limits.set(where.key, create); return create; }),
      update: vi.fn(async ({ where, data }: { where: { key: string }; data: { count: { increment: number } } }) => {
        const row = limits.get(where.key)!;
        row.count += data.count.increment;
        return row;
      }),
    },
  } as unknown as AuthGuardDb;
  return { db };
}

describe("guardAuthRequest", () => {
  it("lets a school address request a code", async () => {
    const { db } = fakeDb();
    expect(await guardAuthRequest(db, "/email-otp/send-verification-otp", { email: "kim@gachon.ac.kr", type: "sign-in" })).toEqual({ ok: true });
  });

  it("refuses a personal address on every email-code route", async () => {
    const { db } = fakeDb(["gachon.ac.kr", "gmail.com"]); // even when gmail.com is wrongly on the allowed list
    for (const path of EMAIL_CODE_PATHS) {
      expect(await guardAuthRequest(db, path, { email: "me@gmail.com", otp: "123456" })).toEqual({ ok: false, code: "INVALID_DOMAIN" });
    }
  });

  it("refuses an email change to an address that is not a school address", async () => {
    const { db } = fakeDb();
    expect(await guardAuthRequest(db, "/email-otp/request-email-change", { email: "kim@gachon.ac.kr", newEmail: "kim@gmail.com" })).toEqual({ ok: false, code: "INVALID_DOMAIN" });
  });

  it("refuses a body with no address, or an address that is not a string", async () => {
    const { db } = fakeDb();
    expect(await guardAuthRequest(db, "/sign-in/email-otp", {})).toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(await guardAuthRequest(db, "/sign-in/email-otp", undefined)).toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(await guardAuthRequest(db, "/sign-in/email-otp", { email: ["kim@gachon.ac.kr"] })).toEqual({ ok: false, code: "INVALID_INPUT" });
  });

  it("does not touch routes that carry no address", async () => {
    const { db } = fakeDb();
    expect(await guardAuthRequest(db, "/get-session", undefined)).toEqual({ ok: true });
    expect(await guardAuthRequest(db, "/sign-out", {})).toEqual({ ok: true });
  });

  it("limits how many codes one address can be sent, but never limits sign-in attempts", async () => {
    const { db } = fakeDb();
    const send = () => guardAuthRequest(db, "/email-otp/send-verification-otp", { email: "Kim@Gachon.ac.kr", type: "sign-in" });
    for (let i = 0; i < SEND_RATE_LIMIT.max; i++) expect(await send()).toEqual({ ok: true });
    expect(await send()).toEqual({ ok: false, code: "RATE_LIMITED" });
    // the same address with different letter case is the same address
    expect(await guardAuthRequest(db, "/email-otp/send-verification-otp", { email: "kim@gachon.ac.kr", type: "sign-in" })).toEqual({ ok: false, code: "RATE_LIMITED" });
    // signing in does not send an email, so it is not part of this limit
    expect(await guardAuthRequest(db, "/sign-in/email-otp", { email: "kim@gachon.ac.kr", otp: "123456" })).toEqual({ ok: true });
  });
});
