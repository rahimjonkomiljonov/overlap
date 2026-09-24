import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";

describe("parseCsv", () => {
  it("parses a simple file", () => {
    const result = parseCsv("name,age\nAlice,30\nBob,25\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.headers).toEqual(["name", "age"]);
    expect(result.records).toHaveLength(2);
    expect(result.records[0].values).toEqual({ name: "Alice", age: "30" });
    expect(result.records[1].line).toBe(3);
  });

  it("handles quoted fields with commas and doubled quotes", () => {
    const result = parseCsv('name,note\n"Kim, Jiyoon","She said ""hi"""\n');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.records[0].values).toEqual({ name: "Kim, Jiyoon", note: 'She said "hi"' });
  });

  it("handles a quoted field containing a newline", () => {
    const result = parseCsv('name,bio\nAlice,"line one\nline two"\n');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.records[0].values.bio).toBe("line one\nline two");
  });

  it("handles CRLF line endings", () => {
    const result = parseCsv("name,age\r\nAlice,30\r\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.records).toHaveLength(1);
  });

  it("strips a UTF-8 BOM", () => {
    const result = parseCsv("﻿name,age\nAlice,30\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.headers).toEqual(["name", "age"]);
  });

  it("skips blank lines", () => {
    const result = parseCsv("name,age\nAlice,30\n\nBob,25\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.records).toHaveLength(2);
  });

  it("lowercases and trims header names", () => {
    const result = parseCsv(" Name , Age \nAlice,30\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.headers).toEqual(["name", "age"]);
  });

  it("rejects an empty file", () => {
    const result = parseCsv("");
    expect(result.ok).toBe(false);
  });

  it("rejects a duplicate header column", () => {
    const result = parseCsv("name,name\na,b\n");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/duplicate/i);
  });

  it("rejects a row with the wrong number of columns", () => {
    const result = parseCsv("name,age\nAlice,30,extra\n");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/line 2/i);
  });

  it("rejects an unclosed quoted field", () => {
    const result = parseCsv('name,age\n"Alice,30\n');
    expect(result.ok).toBe(false);
  });
});
