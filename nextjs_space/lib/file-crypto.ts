import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;
const KEY = process.env.FILE_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || process.env.FISCAL_ENCRYPTION_KEY;

function getKey(): Buffer {
  if (!KEY) {
    throw new Error(
      '[FileCrypto] FATAL: No encryption key configured. ' +
      'Set FILE_ENCRYPTION_KEY, ENCRYPTION_KEY, or FISCAL_ENCRYPTION_KEY in .env.local'
    );
  }
  // Pad or truncate to exactly 32 bytes for AES-256
  return Buffer.from(KEY.padEnd(32, '0').slice(0, 32));
}

/**
 * Encrypts a file buffer using AES-256-CBC.
 * Returns the encrypted buffer with the IV prepended (iv:encrypted format).
 */
export function encryptFile(buffer: Buffer): Buffer {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  // Format: IV (16 bytes) + encrypted data
  return Buffer.concat([iv, encrypted]);
}

/**
 * Decrypts a file buffer that was encrypted with encryptFile.
 * Expects the first 16 bytes to be the IV, followed by the encrypted data.
 */
export function decryptFile(encryptedBuffer: Buffer): Buffer {
  if (encryptedBuffer.length < IV_LENGTH + 1) {
    throw new Error('[FileCrypto] Invalid encrypted buffer — too short');
  }

  const key = getKey();
  const iv = encryptedBuffer.subarray(0, IV_LENGTH);
  const encrypted = encryptedBuffer.subarray(IV_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}


