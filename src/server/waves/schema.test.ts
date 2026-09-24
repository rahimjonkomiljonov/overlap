import { describe, expect, it } from "vitest";
import { declineWaveSchema, unmatchSchema, waveBackSchema } from "./schema";

describe("waveBackSchema", () => {
  it("accepts a bare waveId with no note", () => {
    expect(waveBackSchema.safeParse({ waveId: "w1" }).success).toBe(true);
  });

  it("trims the note", () => {
    const result = waveBackSchema.safeParse({ waveId: "w1", note: "  hi  " });
    expect(result.success).toBe(true);
    expect(result.success && result.data.note).toBe("hi");
  });

  it("rejects a note over 140 characters", () => {
    const result = waveBackSchema.safeParse({ waveId: "w1", note: "a".repeat(141) });
    expect(result.success).toBe(false);
  });

  it("accepts exactly 140 characters", () => {
    expect(waveBackSchema.safeParse({ waveId: "w1", note: "a".repeat(140) }).success).toBe(true);
  });

  it("rejects an empty waveId", () => {
    expect(waveBackSchema.safeParse({ waveId: "" }).success).toBe(false);
  });
});

describe("declineWaveSchema", () => {
  it("accepts a waveId", () => {
    expect(declineWaveSchema.safeParse({ waveId: "w1" }).success).toBe(true);
  });

  it("rejects a missing waveId", () => {
    expect(declineWaveSchema.safeParse({}).success).toBe(false);
  });
});

describe("unmatchSchema", () => {
  it("accepts a matchId", () => {
    expect(unmatchSchema.safeParse({ matchId: "m1" }).success).toBe(true);
  });

  it("rejects an empty matchId", () => {
    expect(unmatchSchema.safeParse({ matchId: "" }).success).toBe(false);
  });
});
