import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * KMS abstraction. Production wires this to AWS KMS (GenerateDataKey / Decrypt)
 * so the master key never leaves the HSM boundary. Locally and in tests we use
 * an in-process master key with the identical envelope contract, so swapping to
 * AWS is one class — no call site changes.
 */
export interface DataKey {
  /** Raw 32-byte key for AES-256, used in memory then discarded. */
  plaintextKey: Buffer;
  /** Master-key-wrapped form, safe to persist alongside ciphertext. */
  encryptedKey: Buffer;
}

export abstract class KmsService {
  abstract generateDataKey(): DataKey;
  abstract decryptDataKey(encryptedKey: Buffer): Buffer;
}

/**
 * Envelope encryption with a local master key (AES-256-GCM). The master key
 * wraps per-value data keys; data keys encrypt the actual PHI. This is the same
 * shape AWS KMS gives you, so production swaps the wrap/unwrap for KMS calls.
 */
@Injectable()
export class LocalKmsService extends KmsService {
  private readonly masterKey: Buffer;

  constructor(masterKeyBase64: string) {
    super();
    const key = Buffer.from(masterKeyBase64, 'base64');
    if (key.length !== 32) {
      throw new Error('KMS_MASTER_KEY must be 32 bytes (base64-encoded) for AES-256');
    }
    this.masterKey = key;
  }

  generateDataKey(): DataKey {
    const plaintextKey = randomBytes(32);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.masterKey, iv);
    const wrapped = Buffer.concat([cipher.update(plaintextKey), cipher.final()]);
    const tag = cipher.getAuthTag();
    // encryptedKey = iv || tag || wrapped
    return { plaintextKey, encryptedKey: Buffer.concat([iv, tag, wrapped]) };
  }

  decryptDataKey(encryptedKey: Buffer): Buffer {
    const iv = encryptedKey.subarray(0, 12);
    const tag = encryptedKey.subarray(12, 28);
    const wrapped = encryptedKey.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.masterKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(wrapped), decipher.final()]);
  }
}
