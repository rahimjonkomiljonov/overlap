/** One problem found while importing a single CSV/JSON file. */
export type ValidationIssue = {
  /** 1-based source line, or "config" for a non-row problem (e.g. bad JSON). */
  line: number | "config";
  message: string;
};

/** Result of importing one file into one table. */
export type ImportResult = {
  file: string;
  created: number;
  updated: number;
  /** Deactivated because they were present before this import but not in this file. */
  deactivated: number;
  /** Rows rejected (schema failure, or a sensitive-keyword hit) — never written. */
  skipped: number;
  issues: ValidationIssue[];
};

export function emptyResult(file: string): ImportResult {
  return { file, created: 0, updated: 0, deactivated: 0, skipped: 0, issues: [] };
}

/** Full report across every file in one import run (S06 "Done when": validation report). */
export type ValidationReport = {
  startedAt: string;
  campusId: string;
  results: ImportResult[];
};

export function reportHasErrors(report: ValidationReport): boolean {
  return report.results.some((r) => r.skipped > 0);
}

export function formatReport(report: ValidationReport): string {
  const lines = [`Reference data import — campus ${report.campusId} — ${report.startedAt}`, ""];
  for (const r of report.results) {
    lines.push(
      `${r.file}: ${r.created} created, ${r.updated} updated, ${r.deactivated} deactivated, ${r.skipped} skipped`,
    );
    for (const issue of r.issues) {
      lines.push(`  line ${issue.line}: ${issue.message}`);
    }
  }
  return lines.join("\n");
}
