import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { runReadinessChecks } from "../src/server/ops/readiness";

/**
 * S24 deploy-time readiness check. Run it against the database the app will actually
 * use (point DATABASE_URL at production) before opening the app to anyone.
 * Exits non-zero if any check fails.
 *
 * Usage: tsx scripts/check-readiness.ts --domain gachon.ac.kr
 */
async function main() {
  loadEnv({ path: ".env.local" });

  const args = process.argv.slice(2);
  const domain = args[args.indexOf("--domain") + 1];
  if (!args.includes("--domain") || !domain) {
    console.error("Usage: tsx scripts/check-readiness.ts --domain <campus email domain>");
    process.exit(1);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  let listBuckets: (() => Promise<string[]>) | undefined;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SECRET_KEY,
    );
    listBuckets = async () => {
      const { data, error } = await supabase.storage.listBuckets();
      if (error) throw new Error(`Could not list storage buckets: ${error.message}`);
      return (data ?? []).map((b) => b.name);
    };
  } else {
    console.log("(Supabase Storage not configured — skipping the bucket check.)");
  }

  try {
    const checks = await runReadinessChecks(prisma, { campusDomain: domain, listBuckets });
    for (const c of checks) console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name} — ${c.detail}`);
    const failed = checks.filter((c) => !c.ok).length;
    console.log(failed === 0 ? "\nReady." : `\n${failed} check(s) failed.`);
    process.exitCode = failed === 0 ? 0 : 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
