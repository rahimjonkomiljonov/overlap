import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * "Who I'd like to meet" (`interestedIn`) is sensitive information. On the phone it may reach exactly one place: the
 * person's own profile (`GET /profile` and the basics step they save it from), and there it travels inside the shared
 * profile service (`src/server/profile`), not in any mobile file. This guards that at the source, the way the website's
 * moderator tests guard the `select` shape: no mobile route or helper may even name the field, so a `select`/`include`
 * that would carry it into another response cannot be added without this test failing.
 */
const root = path.join(__dirname, "..", "..");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
const rel = (file: string) => path.relative(root, file).replaceAll("\\", "/");

const sources = [
  ...walk(path.join(root, "app", "api", "mobile")),
  ...walk(path.join(root, "server", "mobile")),
].filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file));

describe("interestedIn on the mobile API", () => {
  it("finds the mobile sources it is meant to guard", () => {
    expect(sources.length).toBeGreaterThan(20);
  });

  it("is named by no mobile route or helper", () => {
    const offenders = sources
      .filter((file) => /interestedIn/.test(readFileSync(file, "utf8")))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("never reaches a route that is about someone other than the caller", () => {
    // Search and options return shared reference lists; verification is about the caller's own selfie. None may select a profile's preference.
    const others = sources.filter((file) =>
      /reference\/search|profile\/options|verification|\/me\//.test(rel(file)),
    );
    expect(others.length).toBeGreaterThan(0);
    for (const file of others) expect(readFileSync(file, "utf8")).not.toMatch(/interestedIn/);
  });
});
