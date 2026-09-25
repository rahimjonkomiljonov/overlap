import { describe, expect, it } from "vitest";
import { buildIcs } from "./ics";

const NOW = new Date("2026-09-28T03:00:00Z");

describe("buildIcs", () => {
  it("builds a well-formed single-VEVENT calendar with CRLF line endings", () => {
    const ics = buildIcs(
      {
        uid: "meetup-123",
        start: new Date("2026-09-29T05:00:00Z"),
        end: new Date("2026-09-29T07:00:00Z"),
        summary: "지민, 민수와의 만남",
        location: "학생회관 카페",
      },
      NOW,
    );
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("UID:meetup-123\r\n");
    expect(ics).toContain("DTSTART:20260929T050000Z\r\n");
    expect(ics).toContain("DTEND:20260929T070000Z\r\n");
    expect(ics).toContain("SUMMARY:지민\\, 민수와의 만남\r\n");
    expect(ics).toContain("LOCATION:학생회관 카페\r\n");
  });

  it("escapes commas, semicolons and newlines in free text", () => {
    const ics = buildIcs(
      { uid: "u1", start: NOW, end: NOW, summary: "a,b;c\nd" },
      NOW,
    );
    expect(ics).toContain("SUMMARY:a\\,b\\;c\\nd\r\n");
  });

  it("omits LOCATION/DESCRIPTION when not provided", () => {
    const ics = buildIcs({ uid: "u1", start: NOW, end: NOW, summary: "x" }, NOW);
    expect(ics).not.toContain("LOCATION:");
    expect(ics).not.toContain("DESCRIPTION:");
  });
});
