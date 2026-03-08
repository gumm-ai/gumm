/**
 * Symmetric encryption for API connection credentials stored in the database.
 *
 * Algorithm : AES-256-GCM (authenticated encryption)
 * Key derivation : scrypt(NUXT_SESSION_PASSWORD, per-record salt, 32 bytes)
 *
 * Wire format (hex-encoded):
 *   salt(16) || iv(16) || authTag(16) || ciphertext
 *
 * Backward compatibility: if the stored value starts with '{' it is treated as
 * unencrypted legacy JSON and returned as-is so old records keep working until
 * they are rewritten on the next update.
 */
import {
  createCipheriv,
  createDecipheriv,
  scryptSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm' as const;
const KEY_LEN = 32;
const SALT_LEN = 16;
const IV_LEN = 16;
const TAG_LEN = 16;
const HEADER_LEN = SALT_LEN + IV_LEN + TAG_LEN; // 48 bytes

function sessionPassword(): string {
  const pwd = process.env.NUXT_SESSION_PASSWORD;
  if (!pwd) throw new Error('NUXT_SESSION_PASSWORD is not set');
  return pwd;
}

function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LEN) as Buffer;
}

/**
 * Encrypt a config object to an opaque hex string.
 */
export function encryptConfig(data: Record<string, string>): string {
  const password = sessionPassword();
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = deriveKey(password, salt);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = JSON.stringify(data);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([salt, iv, tag, encrypted]).toString('hex');
}

/**
 * Decrypt a hex-encoded config string back to the original object.
 * Handles legacy plain-JSON values transparently.
 */
export function decryptConfig(stored: string): Record<string, string> {
  if (!stored) return {};

  // Legacy: unencrypted JSON stored before this fix was deployed
  if (stored.trimStart().startsWith('{')) {
    try {
      return JSON.parse(stored);
    } catch {
      return {};
    }
  }

  const password = sessionPassword();
  const buf = Buffer.from(stored, 'hex');

  if (buf.length < HEADER_LEN) {
    // Corrupted / unrecognised format — return empty rather than throw
    return {};
  }

  const salt = buf.subarray(0, SALT_LEN);
  const iv = buf.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const tag = buf.subarray(SALT_LEN + IV_LEN, HEADER_LEN);
  const ciphertext = buf.subarray(HEADER_LEN);

  const key = deriveKey(password, salt);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  try {
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(plaintext);
  } catch {
    return {};
  }
}
