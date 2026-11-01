import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * M17: what a store build of the phone app may and may not do on the network. The cleartext (plain http) permission exists
 * only for the automated-test build, so it must never reach a store build, and the app must talk to production over https.
 */
const root = path.join(__dirname, "..", "..", "..");
const require = createRequire(import.meta.url);
const appJson = JSON.parse(readFileSync(path.join(root, "mobile", "app.json"), "utf8")) as {
  expo: { android?: { allowBackup?: boolean } };
};
const appConfig = require(path.join(root, "mobile", "app.config.js")) as (input: { config: Record<string, unknown> }) => {
  plugins?: unknown[];
};

function withTestBuild<T>(value: string | undefined, run: () => T): T {
  const before = process.env.OVERLAP_TEST_BUILD;
  if (value === undefined) delete process.env.OVERLAP_TEST_BUILD;
  else process.env.OVERLAP_TEST_BUILD = value;
  try {
    return run();
  } finally {
    if (before === undefined) delete process.env.OVERLAP_TEST_BUILD;
    else process.env.OVERLAP_TEST_BUILD = before;
  }
}
const pluginsOf = (flag: string | undefined) =>
  withTestBuild(flag, () => appConfig({ config: { plugins: [] } }).plugins ?? []);

describe("the phone app's network settings", () => {
  it("allows plain http only in the automated-test build", () => {
    expect(JSON.stringify(pluginsOf(undefined))).not.toContain("usesCleartextTraffic");
    expect(JSON.stringify(pluginsOf("0"))).not.toContain("usesCleartextTraffic");
    expect(JSON.stringify(pluginsOf("1"))).toContain("usesCleartextTraffic");
  });

  it("keeps the phone's app data out of Android's cloud backup", () => {
    expect(appJson.expo.android?.allowBackup).toBe(false);
  });

  it("defaults to the production website over https, and names no other http address", () => {
    const config = readFileSync(path.join(root, "mobile", "src", "lib", "config.ts"), "utf8");
    expect(config).toContain("'https://overlaps.tech'");

    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const full = path.join(dir, name);
        return statSync(full).isDirectory() ? walk(full) : [full];
      });
    const sources = walk(path.join(root, "mobile", "src")).filter((file) => /\.(ts|tsx)$/.test(file));
    expect(sources.length).toBeGreaterThan(20);
    const offenders = sources
      .filter((file) => /http:\/\/(?!localhost|127\.0\.0\.1|10\.0\.2\.2|www\.w3\.org)/.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(root, file));
    expect(offenders).toEqual([]);
  });
});
