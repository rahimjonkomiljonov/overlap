import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import ko from "../../../messages/ko.json";

/**
 * L7: the processor register in docs/data-flow.md and the privacy policy's processor
 * table must never drift apart — this test is the "Done when" check from S13.
 */
function processorNamesFromDataFlow(): string[] {
  const markdown = readFileSync(join(process.cwd(), "docs/data-flow.md"), "utf-8");
  const tableStart = markdown.indexOf("## Processor register");
  const tableSection = markdown.slice(tableStart, markdown.indexOf("## What never leaves this register"));
  const rows = tableSection
    .split("\n")
    .filter((line) => line.startsWith("|") && !line.startsWith("|---"))
    .slice(1); // drop the header row

  return rows.map((row) => {
    const firstCell = row.split("|")[1] ?? "";
    const withoutBold = firstCell.replace(/\*\*/g, "").trim();
    // A trailing parenthetical is a human-readable annotation (e.g. "Vercel (app
    // hosting)"), not part of the canonical name the privacy policy names it by.
    return withoutBold.replace(/\s*\([^)]*\)\s*$/, "").trim();
  });
}

type ProcessorRow = { name: string; sees: string; location: string };

function processorNamesFromPrivacyPolicy(locale: "ko" | "en"): string[] {
  const messages = locale === "ko" ? ko : en;
  const rows = Object.values(messages.Legal.privacy.processorsTable) as ProcessorRow[];
  return rows.map((row) => row.name);
}

describe("data-flow.md processor register vs. privacy policy (S13, L7)", () => {
  const dataFlowProcessors = processorNamesFromDataFlow();

  it("lists at least one processor to check", () => {
    expect(dataFlowProcessors.length).toBeGreaterThan(0);
  });

  for (const locale of ["ko", "en"] as const) {
    it(`every data-flow.md processor appears in the ${locale} privacy policy`, () => {
      const privacyNames = processorNamesFromPrivacyPolicy(locale).join(" | ").toLowerCase();
      for (const processor of dataFlowProcessors) {
        expect(privacyNames).toContain(processor.toLowerCase());
      }
    });
  }
});
