import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Prisma 7 requires a driver adapter for every database (see docs/BUILD_PLAN.md S03).
// DATABASE_URL is the pooled (pgbouncer transaction-mode) connection; Prisma CLI
// commands use DIRECT_URL instead, configured separately in prisma.config.ts.
//
// max: 1 — Supabase's pooler already multiplexes connections upstream. Opening a
// local pool of the pg-adapter default (10) per serverless instance would just add
// another pool on top and can exhaust the pooler's own connection slots faster as
// instances scale out. One connection per instance is the recommended pattern here.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 10_000,
});

const globalForPrisma = globalThis as typeof globalThis & { prisma?: PrismaClient };

// Cached on globalThis in dev so Next.js hot-reload doesn't open a fresh pool on every
// edit (see docs/BUILD_PLAN.md S03 gotcha; the Prisma+Next.js troubleshooting guide).
export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
