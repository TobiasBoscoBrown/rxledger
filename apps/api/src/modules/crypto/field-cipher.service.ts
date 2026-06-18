import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { KmsService } from './kms.service';

const VERSION = 1;

/**
 * Encrypts/decrypts individual PHI field values for storage. Each value gets a
 * fresh data key (envelope encryption), so a single leaked ciphertext yields
 * nothing without the KMS master key. The persisted token is self-describing:
 *
 *   v1.<wrappedDek>.<iv>.<tag>.<ciphertext>   (all base64url)
 *
 * Storing the version lets us rotate algorithms/keys without a flag-day
 * migration: new writes use the new scheme, reads dispatch on the version.
 */
@Injectable()
export class FieldCipherService {
  constructor(private readonly kms: KmsService) {}

  encrypt(plaintext: string): string {
    const { plaintextKey, encryptedKey } = this.kms.generateDataKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', plaintextKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    plaintextKey.fill(0); // scrub the data key from memory after use
    return [
      `v${VERSION}`,
      encryptedKey.toString('base64url'),
      iv.toString('base64url'),
      tag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  decrypt(token: string): string {
    const parts = token.split('.');
    if (parts.length !== 5 || parts[0] !== `v${VERSION}`) {
      throw new Error('Unrecognized ciphertext envelope');
    }
    const encryptedKey = Buffer.from(parts[1]!, 'base64url');
    const iv = Buffer.from(parts[2]!, 'base64url');
    const tag = Buffer.from(parts[3]!, 'base64url');
    const ciphertext = Buffer.from(parts[4]!, 'base64url');
    const dataKey = this.kms.decryptDataKey(encryptedKey);
    const decipher = createDecipheriv('aes-256-gcm', dataKey, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    dataKey.fill(0);
    return plaintext.toString('utf8');
  }

  /** True if a stored value is one of our envelopes (vs. legacy plaintext). */
  isEncrypted(value: string): boolean {
    return /^v\d+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
  }
}
