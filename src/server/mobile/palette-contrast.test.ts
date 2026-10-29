import { describe, expect, it } from "vitest";
import { palettes, type Palette } from "../../../mobile/src/lib/palettes";

/** WCAG 2.x relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Every pair the app actually draws text with: [text colour, what it sits on]. */
const TEXT_PAIRS: [keyof Palette, keyof Palette][] = [
  ["ink", "background"],
  ["ink", "card"],
  ["muted", "background"],
  ["muted", "card"],
  ["onBrand", "brand"],
  ["brand", "background"],
  ["brand", "card"],
  ["brand", "chipSelected"],
  ["good", "card"],
  ["good", "background"],
  ["bad", "card"],
  ["bad", "background"],
  ["bad", "badBackground"],
  ["warn", "warnBackground"],
  ["ink", "tag"],
  ["ink", "chipSelected"],
];

describe("mobile palettes (BUILD_PLAN M15b): text keeps WCAG AA contrast, 4.5:1, in light and dark", () => {
  for (const [name, palette] of Object.entries(palettes)) {
    for (const [text, surface] of TEXT_PAIRS) {
      it(`${name}: ${text} on ${surface}`, () => {
        expect(contrast(palette[text], palette[surface])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it("light and dark define exactly the same colour names", () => {
    expect(Object.keys(palettes.dark).sort()).toEqual(Object.keys(palettes.light).sort());
  });
});
