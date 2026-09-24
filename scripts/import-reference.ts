import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  importClubs,
  importCourses,
  importInterests,
  importPrompts,
  importSafetyResources,
  importSpots,
} from "../src/server/reference/importers";
import { emptyResult, formatReport, reportHasErrors, type ImportResult } from "../src/server/reference/report";

/**
 * CLI entry for the S06 reference-data import (courses, clubs, spots, prompts,
 * interests, safety contacts). Idempotent — safe to re-run.
 *
 * Usage: tsx scripts/import-reference.ts --dir reference-data/sample --domain test.ac.kr
 *
 * Expects `<dir>/courses.csv`, `clubs.csv`, `spots.csv`, `interests.csv`,
 * `prompts.csv`, `safety-contacts.json`. Every file is optional — missing files are
 * skipped, not errors, so a campus-specific re-import (e.g. just courses each term)
 * doesn't need to touch files that haven't changed. `interests.csv` and `prompts.csv`
 * are shared across campuses (not written per campus) if present in more than one
 * campus's directory, the last import wins.
 */
async function main() {
  loadEnv({ path: ".env.local" });

  const args = process.argv.slice(2);
  const dir = argOf(args, "--dir");
  const domain = argOf(args, "--domain");
  if (!dir || !domain) {
    console.error("Usage: tsx scripts/import-reference.ts --dir <path> --domain <campus email domain>");
    process.exit(1);
  }
  if (!existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const emailDomain = await prisma.emailDomain.findUnique({ where: { domain } });
  if (!emailDomain) {
    console.error(
      `No campus found for email domain "${domain}". Create the Campus and EmailDomain rows first.`,
    );
    await prisma.$disconnect();
    process.exit(1);
  }
  const campusId = emailDomain.campusId;

  const results: ImportResult[] = [];
  const files = new Set(readdirSync(dir));

  results.push(
    await runIfPresent(files, dir, "courses.csv", (text) =>
      importCourses(prisma, campusId, "courses.csv", text),
    ),
  );
  results.push(
    await runIfPresent(files, dir, "clubs.csv", (text) => importClubs(prisma, campusId, "clubs.csv", text)),
  );
  results.push(
    await runIfPresent(files, dir, "spots.csv", (text) => importSpots(prisma, campusId, "spots.csv", text)),
  );
  results.push(
    await runIfPresent(files, dir, "interests.csv", (text) => importInterests(prisma, "interests.csv", text)),
  );
  results.push(
    await runIfPresent(files, dir, "prompts.csv", (text) => importPrompts(prisma, "prompts.csv", text)),
  );
  results.push(
    await runIfPresent(files, dir, "safety-contacts.json", (text) =>
      importSafetyResources(prisma, campusId, "safety-contacts.json", text),
    ),
  );

  const report = {
    startedAt: new Date().toISOString(),
    campusId,
    results: results.filter((r): r is ImportResult => r !== null),
  };

  console.log(formatReport(report));
  await prisma.$disconnect();

  if (reportHasErrors(report)) {
    console.error("\nImport completed with skipped rows — see issues above.");
    process.exit(1);
  }
}

function argOf(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

async function runIfPresent(
  files: Set<string>,
  dir: string,
  file: string,
  run: (text: string) => Promise<ImportResult>,
): Promise<ImportResult> {
  if (!files.has(file)) return emptyResult(`${file} (not present, skipped)`);
  const text = readFileSync(join(dir, file), "utf-8");
  return run(text);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
