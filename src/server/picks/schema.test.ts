import { describe, expect, it } from "vitest";
import { passPickSchema, sendWaveSchema, targetElementSchema, WAVE_NOTE_MAX_LENGTH } from "./schema";

describe("targetElementSchema", () => {
  it("accepts a photo target with a photoId", () => {
    expect(targetElementSchema.safeParse({ type: "photo", photoId: "p1" }).success).toBe(true);
  });

  it("accepts a promptAnswer target", () => {
    expect(targetElementSchema.safeParse({ type: "promptAnswer", promptAnswerId: "a1" }).success).toBe(true);
  });

  it("accepts a generic profile target with no id", () => {
    expect(targetElementSchema.safeParse({ type: "profile" }).success).toBe(true);
  });

  it("rejects a photo target missing its photoId", () => {
    expect(targetElementSchema.safeParse({ type: "photo" }).success).toBe(false);
  });

  it("rejects an unknown type", () => {
    expect(targetElementSchema.safeParse({ type: "video", photoId: "p1" }).success).toBe(false);
  });
});

describe("sendWaveSchema", () => {
  it("accepts a wave with no note", () => {
    const result = sendWaveSchema.safeParse({ batchItemId: "b1", targetElement: { type: "profile" } });
    expect(result.success).toBe(true);
  });

  it("accepts a wave with a note within the length limit", () => {
    const result = sendWaveSchema.safeParse({
      batchItemId: "b1",
      targetElement: { type: "profile" },
      note: "a".repeat(WAVE_NOTE_MAX_LENGTH),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a note over the length limit", () => {
    const result = sendWaveSchema.safeParse({
      batchItemId: "b1",
      targetElement: { type: "profile" },
      note: "a".repeat(WAVE_NOTE_MAX_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });

  it("trims whitespace from the note", () => {
    const result = sendWaveSchema.safeParse({
      batchItemId: "b1",
      targetElement: { type: "profile" },
      note: "  hi  ",
    });
    expect(result.success && result.data.note).toBe("hi");
  });

  it("rejects a missing batchItemId", () => {
    expect(sendWaveSchema.safeParse({ targetElement: { type: "profile" } }).success).toBe(false);
  });
});

describe("passPickSchema", () => {
  it("accepts a valid batchItemId", () => {
    expect(passPickSchema.safeParse({ batchItemId: "b1" }).success).toBe(true);
  });

  it("rejects an empty batchItemId", () => {
    expect(passPickSchema.safeParse({ batchItemId: "" }).success).toBe(false);
  });
});
