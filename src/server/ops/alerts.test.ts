import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getRecentAlerts, recordAlert } from "./alerts";

// Same mkdtemp/chdir pattern as src/server/storage/blob.test.ts — the alerts file path is
// derived from process.cwd() at call time (not cached at module load), so isolating cwd
// per test isolates the file too.
describe("alerts (S21 local Sentry substitute)", () => {
  const originalCwd = process.cwd();
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "overlap-alerts-"));
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns an empty list when nothing has been recorded yet", async () => {
    expect(await getRecentAlerts()).toEqual([]);
  });

  it("round-trips a recorded alert", async () => {
    await recordAlert({ context: "test-context", message: "boom" });
    const alerts = await getRecentAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ context: "test-context", message: "boom" });
    expect(typeof alerts[0].at).toBe("string");
  });

  it("returns most-recent-first and respects the limit", async () => {
    await recordAlert({ context: "first", message: "1" });
    await recordAlert({ context: "second", message: "2" });
    await recordAlert({ context: "third", message: "3" });

    const alerts = await getRecentAlerts(2);
    expect(alerts).toHaveLength(2);
    expect(alerts[0].context).toBe("third");
    expect(alerts[1].context).toBe("second");
  });
});
