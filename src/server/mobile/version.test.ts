import { describe, expect, it } from "vitest";
import { isAppVersionSupported, MIN_APP_VERSION, MOBILE_API_VERSION } from "./version";

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

  it("refuses a version it cannot read", () => {
    for (const bad of ["", "1.2", "1.2.3.4", "1.2.x", "v1.2.3", "1.2.3-beta"]) expect(isAppVersionSupported(bad, "1.0.0")).toBe(false);
  });

  it("uses the server's own minimum by default, and the first app version satisfies it", () => {
    expect(isAppVersionSupported(MIN_APP_VERSION)).toBe(true);
    expect(MOBILE_API_VERSION).toBe(1);
  });
});
