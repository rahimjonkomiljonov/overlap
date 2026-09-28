import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Prisma 7 requires a driver adapter for every database (see docs/BUILD_PLAN.md S03).
// DATABASE_URL is the pooled (pgbouncer transaction-mode) connection; Prisma CLI
// commands use DIRECT_URL instead, configured separately in prisma.config.ts.
//
// max: 1 by default — Supabase's pooler already multiplexes connections upstream in
// production. Opening a local pool of the pg-adapter default (10) per serverless
// instance would just add another pool on top and can exhaust the pooler's own
// connection slots faster as instances scale out. One connection per instance is the
// recommended pattern there.
//
// DATABASE_POOL_MAX overrides this for environments with no pooler in front of a plain
// Postgres (this long-running dev server, CI's own throwaway service container) — a
// single process really is the only thing talking to the database there, and a pool of
// 1 needlessly serializes concurrent queries onto one physical connection. Kept as a
// real, low-risk improvement from S23's load test, though it turned out NOT to explain
// that test's actual finding (see docs/BUILD_PLAN.md's S23 log): raising this alone
// barely moved the numbers, since Postgres itself was never the bottleneck (buffer-cache
// hit rate stayed ~100%, connections sat mostly idle). Leave unset in production.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: process.env.DATABASE_POOL_MAX ? parseInt(process.env.DATABASE_POOL_MAX, 10) : 1,
  connectionTimeoutMillis: 10_000,
});

const globalForPrisma = globalThis as typeof globalThis & { prisma?: PrismaClient };

// Cached on globalThis in dev so Next.js hot-reload doesn't open a fresh pool on every
// edit (see docs/BUILD_PLAN.md S03 gotcha; the Prisma+Next.js troubleshooting guide).
export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
