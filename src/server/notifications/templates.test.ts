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
