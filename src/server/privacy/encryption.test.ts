import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const KEY_V1 = "FIELD_ENCRYPTION_KEY_V1";
const KEY_V2 = "FIELD_ENCRYPTION_KEY_V2";

function freshKey() {
  return randomBytes(32).toString("base64");
}

describe("field encryption", () => {
  beforeEach(() => {
    // Each module import caches its key map lazily on first use, so isolate every
    // test with vi.resetModules() + a fresh dynamic import instead of sharing state.
    delete process.env[KEY_V1];
    delete process.env[KEY_V2];
  });

  it("round-trips a value", async () => {
    process.env[KEY_V1] = freshKey();
    const { encryptField, decryptField } = await freshModule();
    const ciphertext = encryptField("interested in: everyone");
    expect(ciphertext).not.toContain("interested");
    expect(decryptField(ciphertext)).toBe("interested in: everyone");
  });

  it("produces a different ciphertext each time (random IV)", async () => {
    process.env[KEY_V1] = freshKey();
    const { encryptField } = await freshModule();
    const a = encryptField("same input");
    const b = encryptField("same input");
    expect(a).not.toBe(b);
  });

  it("throws if the ciphertext is tampered with", async () => {
    process.env[KEY_V1] = freshKey();
    const { encryptField, decryptField } = await freshModule();
    const parts = encryptField("secret value").split(":");
    parts[3] = Buffer.from("tampered ciphertext bytes!!").toString("base64url");
    expect(() => decryptField(parts.join(":"))).toThrow();
  });

  it("throws if the auth tag is tampered with", async () => {
    process.env[KEY_V1] = freshKey();
    const { encryptField, decryptField } = await freshModule();
    const parts = encryptField("secret value").split(":");
    parts[2] = Buffer.from(randomBytes(16)).toString("base64url");
    expect(() => decryptField(parts.join(":"))).toThrow();
  });

  it("decrypts older versions after a key is rotated, and encrypts new values with the newest", async () => {
    process.env[KEY_V1] = freshKey();
    const { encryptField } = await freshModule();
    const oldCiphertext = encryptField("written before rotation");

    process.env[KEY_V2] = freshKey();
    const rotated = await freshModule();
    const newCiphertext = rotated.encryptField("written after rotation");

    expect(oldCiphertext.startsWith("v1:")).toBe(true);
    expect(newCiphertext.startsWith("v2:")).toBe(true);
    expect(rotated.decryptField(oldCiphertext)).toBe("written before rotation");
    expect(rotated.decryptField(newCiphertext)).toBe("written after rotation");
  });

  it("throws a clear error when no key is configured", async () => {
    const { encryptField } = await freshModule();
    expect(() => encryptField("x")).toThrow(/No field-encryption keys found/);
  });

  it("throws a clear error when a key is the wrong length", async () => {
    process.env[KEY_V1] = Buffer.from("too-short").toString("base64");
    const { encryptField } = await freshModule();
    expect(() => encryptField("x")).toThrow(/32 bytes/);
  });

  it("throws when decrypting a value from a version with no configured key", async () => {
    process.env[KEY_V1] = freshKey();
    const { encryptField, decryptField } = await freshModule();
    const ciphertext = encryptField("x").replace(/^v1:/, "v9:");
    expect(() => decryptField(ciphertext)).toThrow(/version 9/);
  });

  it("rejects a malformed serialized value", async () => {
    process.env[KEY_V1] = freshKey();
    const { decryptField } = await freshModule();
    expect(() => decryptField("not-a-valid-value")).toThrow(/Malformed/);
  });
});

/** Re-imports the module fresh so its lazily-cached key map picks up the current env. */
async function freshModule() {
  vi.resetModules();
  return import("./encryption");
}
