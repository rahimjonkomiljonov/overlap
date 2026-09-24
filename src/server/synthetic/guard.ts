import type { PrismaClient } from "@/generated/prisma/client";

export type SyntheticGuardDb = Pick<PrismaClient, "user">;

/**
 * Synthetic users must never exist in production (CLAUDE.md: "Synthetic users exist
 * only in dev and staging"). This is the check that makes that a real, tested control
 * rather than just a rule in a doc — intended to be called from a deploy-time check
 * once one exists (S24), and from scripts/generate-synthetic-campus.ts itself as a
 * second, redundant guard before it writes anything.
 */
export async function assertNoSyntheticUsersInProduction(
  db: SyntheticGuardDb,
  options: { isProduction?: boolean } = {},
): Promise<void> {
  const isProduction = options.isProduction ?? process.env.NODE_ENV === "production";
  if (!isProduction) {
    return;
  }
  const count = await db.user.count({ where: { isSynthetic: true } });
  if (count > 0) {
    throw new Error(
      `Refusing to continue: ${count} synthetic user row(s) exist under production settings.`,
    );
  }
}
