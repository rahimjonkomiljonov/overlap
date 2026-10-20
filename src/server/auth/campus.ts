import type { PrismaClient } from "@/generated/prisma/client";
import { normalizeEmail } from "./hash";

export type CampusLookupDb = Pick<PrismaClient, "emailDomain">;

/**
 * Personal mail providers. Overlap is for verified students, so an address on one of these is
 * never accepted, even if a row for it ends up in the allowed-domains table (that is exactly what
 * happened when a demo campus mapped gmail.com in production: anyone with a Gmail address could
 * join the waitlist). A school's own domain is the only thing that proves someone is a student.
 */
export const PERSONAL_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com", "googlemail.com",
  "naver.com", "daum.net", "hanmail.net", "kakao.com", "nate.com",
  "yahoo.com", "yahoo.co.kr", "ymail.com",
  "outlook.com", "hotmail.com", "live.com", "msn.com",
  "icloud.com", "me.com", "mac.com",
  "aol.com", "proton.me", "protonmail.com", "gmx.com", "zoho.com", "yandex.com", "mail.com", "qq.com", "163.com",
]);

export function isPersonalEmailDomain(domain: string): boolean {
  return PERSONAL_EMAIL_DOMAINS.has(domain.trim().toLowerCase());
}

/**
 * Which campus (if any) an email belongs to, by its domain. Assumes `email` is already
 * a syntactically valid address (validate shape with Zod before calling this) — this
 * only checks whether its domain is on an allowlisted campus's EmailDomain list, and
 * that it is not a personal mail provider.
 */
export async function resolveCampusForEmail(db: CampusLookupDb, email: string) {
  const domain = normalizeEmail(email).split("@")[1];
  if (!domain || isPersonalEmailDomain(domain)) return null;

  const match = await db.emailDomain.findUnique({
    where: { domain },
    include: { campus: true },
  });
  return match?.campus ?? null;
}
