import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * E3: "No GPS or live location in v1" (Location Information Act) — this step's own
 * BUILD_PLAN "Done when" line names a grep/lint check for this directly. The pure
 * detector is tested against known positive/negative samples first (so this test proves
 * it actually catches something, not just that it passes vacuously), then run for real
 * against the whole `src/` tree.
 */
const GEOLOCATION_PATTERN = /navigator\.geolocation|getCurrentPosition|watchPosition|GeolocationPosition/;

export function containsGeolocationApi(source: string): boolean {
  return GEOLOCATION_PATTERN.test(source);
}

function listSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "generated" || entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      results.push(full);
    }
  }
  return results;
}

describe("containsGeolocationApi", () => {
  it("flags real Geolocation API usage", () => {
    expect(containsGeolocationApi("navigator.geolocation.getCurrentPosition(onSuccess)")).toBe(true);
    expect(containsGeolocationApi("navigator.geolocation.watchPosition(onSuccess)")).toBe(true);
  });

  it("does not flag unrelated code that merely mentions a place or spot", () => {
    expect(containsGeolocationApi("const location = spot.name; // never GPS")).toBe(false);
  });
});

describe("no file under src/ uses the Geolocation API (E3, Location Information Act)", () => {
  it("finds zero offending files", () => {
    // Excludes this test file itself — its own pattern definition and positive-case
    // sample strings above legitimately contain the very substrings being scanned for.
    const thisFile = new URL(import.meta.url).pathname;
    const files = listSourceFiles(join(process.cwd(), "src")).filter((f) => f !== thisFile);
    expect(files.length).toBeGreaterThan(0);

    const offenders = files.filter((file) => containsGeolocationApi(readFileSync(file, "utf-8")));
    expect(offenders).toEqual([]);
  });
});
