import { ValueTransformer } from 'typeorm';
import { decryptString, encryptString, keyFromHex } from '../crypto/aes';

/**
 * Column transformer that encrypts values at rest with AES-256-GCM.
 *
 * Reads the key from process.env because TypeORM instantiates transformers
 * at entity-definition time, outside Nest's DI. The key is resolved lazily on
 * first use so that config validation has already run.
 */
export class EncryptedTransformer implements ValueTransformer {
  private key: Buffer | null = null;

  private getKey(): Buffer {
    this.key ??= keyFromHex(process.env.ENCRYPTION_KEY ?? '');
    return this.key;
  }

  to(value: string | null | undefined): string | null | undefined {
    // Preserve undefined so partial saves leave the column untouched.
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    return encryptString(value, this.getKey());
  }

  from(value: string | null): string | null {
    if (value === null) return null;
    return decryptString(value, this.getKey());
  }
}

export const encryptedTransformer = new EncryptedTransformer();
