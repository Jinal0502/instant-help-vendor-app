import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { config } from '@config/index';

// Key must be a 64-char hex string (32 bytes) in ENCRYPTION_KEY env var
const KEY = Buffer.from(config.encryption.key, 'hex');

if (KEY.length !== 32) {
  throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
}

/**
 * Encrypts plaintext using AES-256-GCM.
 * Output format (base64): [12-byte IV][16-byte auth tag][ciphertext]
 */
export const encrypt = (plaintext: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
};

/**
 * Decrypts a base64 string produced by encrypt().
 * Throws if the auth tag is invalid (tampered data).
 */
export const decrypt = (ciphertext: string): string => {
  const buf = Buffer.from(ciphertext, 'base64');
  const iv        = buf.subarray(0, 12);
  const tag       = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher  = createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
};
