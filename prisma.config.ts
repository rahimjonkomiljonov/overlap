import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Prisma 7 does not load any .env file on its own. This project keeps secrets in
// .env.local (Next.js convention, see CLAUDE.md), so load that explicitly here.
// Silently does nothing if the file is absent (CI, Vercel builds) — see the comment
// on `url` below for why that must not be an error here.
loadEnv({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Deliberately process.env directly, not prisma/config's `env()` helper: `env()`
    // throws immediately if the variable is unset, which broke `prisma generate` (it
    // needs no database connection at all) in CI and in any clean install — see
    // docs/BUILD_PLAN.md S03 log. `migrate`/`db pull`/`studio` still fail normally,
    // with an actual connection error, if DIRECT_URL is genuinely needed and missing.
    //
    // The direct (non-pooled) connection: required for migrate/introspect against
    // Supabase's transaction pooler. The app itself connects with DATABASE_URL
    // (pooled) via its own adapter in src/server/db.ts, not through this file.
    url: process.env.DIRECT_URL,
  },
});
