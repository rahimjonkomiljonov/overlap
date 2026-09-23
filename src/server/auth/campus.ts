import type { PrismaClient } from "@/generated/prisma/client";
import { normalizeEmail } from "./hash";

export type CampusLookupDb = Pick<PrismaClient, "emailDomain">;

/**
 * Which campus (if any) an email belongs to, by its domain. Assumes `email` is already
 * a syntactically valid address (validate shape with Zod before calling this) — this
 * only checks whether its domain is on an allowlisted campus's EmailDomain list.
 */
export async function resolveCampusForEmail(db: CampusLookupDb, email: string) {
  const domain = normalizeEmail(email).split("@")[1];
  if (!domain) return null;

  const match = await db.emailDomain.findUnique({
    where: { domain },
    include: { campus: true },
  });
  return match?.campus ?? null;
}
