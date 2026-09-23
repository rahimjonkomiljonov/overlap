import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Prisma 7 does not load any .env file on its own. This project keeps secrets in
// .env.local (Next.js convention, see CLAUDE.md), so load that explicitly here.
loadEnv({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // The direct (non-pooled) connection: required for migrate/introspect against
    // Supabase's transaction pooler. The app itself connects with DATABASE_URL
    // (pooled) via its own adapter in src/server/db.ts, not through this file.
    url: env("DIRECT_URL"),
  },
});
