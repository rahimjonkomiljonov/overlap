import { describe, expect, it } from "vitest";
import { renderNotificationEmail } from "./templates";

const TYPES = ["MATCH", "WAVE_RECEIVED", "UNREAD_MESSAGE"] as const;
const LOCALES = ["ko", "en"] as const;

describe("renderNotificationEmail", () => {
  for (const type of TYPES) {
    for (const locale of LOCALES) {
      it(`renders a non-empty subject and text for ${type}/${locale}`, () => {
        const { subject, text } = renderNotificationEmail(type, locale);
        expect(subject.length).toBeGreaterThan(0);
        expect(text.length).toBeGreaterThan(0);
      });
    }
  }

  it("never includes another user's name, a note, or message text — templates are static strings, not interpolated", () => {
    for (const type of TYPES) {
      for (const locale of LOCALES) {
        const { subject, text } = renderNotificationEmail(type, locale);
        expect(subject).not.toMatch(/\{|\}/);
        expect(text).not.toMatch(/\{|\}/);
      }
    }
  });

  it("ko and en templates differ for every type", () => {
    for (const type of TYPES) {
      const ko = renderNotificationEmail(type, "ko");
      const en = renderNotificationEmail(type, "en");
      expect(ko.subject).not.toBe(en.subject);
      expect(ko.text).not.toBe(en.text);
    }
  });
});

describe("MODERATION_ACTION notice", () => {
  const until = "2026-10-17T06:30:00.000Z"; // 15:30 on 17 Oct, Seoul time

  it("says what happened for warn, suspend and ban, in both languages", () => {
    for (const locale of LOCALES) {
      const warn = renderNotificationEmail("MODERATION_ACTION", locale, { action: "WARN" });
      const suspend = renderNotificationEmail("MODERATION_ACTION", locale, { action: "SUSPEND", until });
      const ban = renderNotificationEmail("MODERATION_ACTION", locale, { action: "BAN" });
      expect(new Set([warn.subject, suspend.subject, ban.subject]).size).toBe(3);
    }
  });

  it("puts the end of a suspension in Seoul time", () => {
    expect(renderNotificationEmail("MODERATION_ACTION", "en", { action: "SUSPEND", until }).text).toContain("15:30");
    expect(renderNotificationEmail("MODERATION_ACTION", "ko", { action: "SUSPEND", until }).text).toContain("15:30");
  });

  it("never carries a moderator note, a name or any other placeholder", () => {
    const { subject, text } = renderNotificationEmail("MODERATION_ACTION", "en", {
      action: "SUSPEND",
      until,
      reason: "secret chat text",
      reporter: "someone",
    });
    expect(text).not.toContain("secret chat text");
    expect(text).not.toContain("someone");
    expect(`${subject}${text}`).not.toMatch(/{|}|undefined/);
  });
});
