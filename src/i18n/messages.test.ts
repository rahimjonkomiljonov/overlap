import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import ko from "../../messages/ko.json";

type Tree = { [key: string]: string | string[] | Tree };

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((acc, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      acc[path] = value;
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => {
        acc[`${path}.${i}`] = v;
      });
    } else {
      Object.assign(acc, flatten(value, path));
    }
    return acc;
  }, {});
}

describe("translation files", () => {
  const koFlat = flatten(ko);
  const enFlat = flatten(en);

  it("have exactly the same keys in ko and en", () => {
    expect(Object.keys(koFlat).sort()).toEqual(Object.keys(enFlat).sort());
  });

  it("have no empty strings", () => {
    for (const [key, value] of [...Object.entries(koFlat), ...Object.entries(enFlat)]) {
      expect(value.trim(), `empty translation: ${key}`).not.toBe("");
    }
  });
});
