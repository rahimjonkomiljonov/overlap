import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Field-level encryption for sensitive columns (e.g. the dating-preference field added
 * in S07 — see REQUIREMENTS.md B2/L1). AES-256-GCM: authenticated, so a tampered
 * ciphertext fails to decrypt rather than silently returning garbage.
 *
 * Versioned keys support rotation without a big-bang migration: set
 * FIELD_ENCRYPTION_KEY_V1, _V2, ... in env (each 32 random bytes, base64 — generate
 * with `openssl rand -base64 32`). New values are always encrypted with the highest
 * version present; older ciphertext keeps decrypting with whichever version it was
 * written under, tagged in the stored string itself. To rotate: add a new _V{n+1},
 * re-encrypt existing rows at your own pace, then remove the old var once nothing
 * references it.
 *
 * Serialized format (safe to store in a text/String column): "v{version}:{iv}:{tag}:{ciphertext}",
 * each part base64url.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // recommended nonce length for GCM
const KEY_ENV_PREFIX = "FIELD_ENCRYPTION_KEY_V";
const MAX_KEY_VERSIONS_CHECKED = 50; // generous upper bound; stops the env scan from running forever

let keyCache: Map<number, Buffer> | undefined;

function loadKeys(): Map<number, Buffer> {
  const keys = new Map<number, Buffer>();
  for (let version = 1; version <= MAX_KEY_VERSIONS_CHECKED; version++) {
    const raw = process.env[`${KEY_ENV_PREFIX}${version}`];
    if (!raw) continue;
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) {
      throw new Error(
        `${KEY_ENV_PREFIX}${version} must decode to exactly 32 bytes (got ${key.length}). Generate with: openssl rand -base64 32`,
      );
    }
    keys.set(version, key);
  }
  if (keys.size === 0) {
    throw new Error(`No field-encryption keys found. Set ${KEY_ENV_PREFIX}1 in .env.local.`);
  }
  return keys;
}

function getKeys(): Map<number, Buffer> {
  if (!keyCache) {
    keyCache = loadKeys();
  }
  return keyCache;
}

function currentVersion(keys: Map<number, Buffer>): number {
  return Math.max(...keys.keys());
}

export function encryptField(plaintext: string): string {
  const keys = getKeys();
  const version = currentVersion(keys);
  const key = keys.get(version)!;
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    `v${version}`,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptField(serialized: string): string {
  const parts = serialized.split(":");
  if (parts.length !== 4 || !parts[0].startsWith("v")) {
    throw new Error("Malformed encrypted field value.");
  }
  const [versionTag, ivB64, tagB64, ciphertextB64] = parts;
  const version = Number(versionTag.slice(1));
  const key = getKeys().get(version);
  if (!key) {
    throw new Error(`No field-encryption key configured for version ${version}.`);
  }
  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  const ciphertext = Buffer.from(ciphertextB64, "base64url");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  // Throws if the ciphertext or tag was tampered with, or the wrong key is used.
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
