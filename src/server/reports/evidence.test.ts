import { describe, expect, it } from "vitest";
import { buildEvidenceSnapshot, MAX_EVIDENCE_MESSAGES } from "./evidence";

function message(senderId: string, text: string, createdAt: string) {
  return { senderId, text, createdAt: new Date(createdAt) };
}

describe("buildEvidenceSnapshot", () => {
  it("sorts messages oldest first regardless of input order", () => {
    const snapshot = buildEvidenceSnapshot([
      message("b", "second", "2026-09-25T10:01:00Z"),
      message("a", "first", "2026-09-25T10:00:00Z"),
    ]);
    expect(snapshot.map((m) => m.text)).toEqual(["first", "second"]);
  });

  it("caps at the most recent 50 messages, dropping the oldest ones first", () => {
    const messages = Array.from({ length: 60 }, (_, i) =>
      message("u", `msg-${i}`, new Date(2026, 0, 1, 0, i).toISOString()),
    );
    const snapshot = buildEvidenceSnapshot(messages);
    expect(snapshot).toHaveLength(MAX_EVIDENCE_MESSAGES);
    expect(snapshot[0].text).toBe("msg-10");
    expect(snapshot.at(-1)!.text).toBe("msg-59");
  });

  it("serializes createdAt as an ISO string (Json-safe)", () => {
    const snapshot = buildEvidenceSnapshot([message("a", "hi", "2026-09-25T10:00:00.000Z")]);
    expect(snapshot[0].createdAt).toBe("2026-09-25T10:00:00.000Z");
  });

  it("returns an empty array for no messages", () => {
    expect(buildEvidenceSnapshot([])).toEqual([]);
  });
});
