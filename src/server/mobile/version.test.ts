import { afterEach, describe, expect, it, vi } from "vitest";
import { getMinAppVersion, isAppVersionSupported, MOBILE_API_VERSION } from "./version";

afterEach(() => vi.unstubAllEnvs());

describe("isAppVersionSupported", () => {
  it("accepts the minimum itself and anything newer", () => {
    expect(isAppVersionSupported("1.2.3", "1.2.3")).toBe(true);
    expect(isAppVersionSupported("1.2.4", "1.2.3")).toBe(true);
    expect(isAppVersionSupported("1.10.0", "1.9.9")).toBe(true); // numbers, not text: 10 > 9
    expect(isAppVersionSupported("2.0.0", "1.99.99")).toBe(true);
  });

  it("refuses anything older", () => {
    expect(isAppVersionSupported("1.2.2", "1.2.3")).toBe(false);
    expect(isAppVersionSupported("1.9.9", "1.10.0")).toBe(false);
    expect(isAppVersionSupported("0.9.0", "1.0.0")).toBe(false);
  });

  it("refuses a version it cannot read, or none at all", () => {
    for (const bad of ["", "1.2", "1.2.3.4", "1.2.x", "v1.2.3", "1.2.3-beta", null, undefined])
      expect(isAppVersionSupported(bad, "1.0.0")).toBe(false);
  });
});

describe("getMinAppVersion", () => {
  it("defaults to the first app version, which therefore satisfies it", () => {
    expect(getMinAppVersion()).toBe("0.1.0");
    expect(isAppVersionSupported("0.1.0")).toBe(true);
    expect(MOBILE_API_VERSION).toBe(1);
  });

  it("can be raised from the environment, and ignores a malformed value", () => {
    vi.stubEnv("MIN_APP_VERSION", "2.0.0");
    expect(getMinAppVersion()).toBe("2.0.0");
    expect(isAppVersionSupported("1.9.9")).toBe(false);
    vi.stubEnv("MIN_APP_VERSION", "nonsense");
    expect(getMinAppVersion()).toBe("0.1.0");
  });
});
