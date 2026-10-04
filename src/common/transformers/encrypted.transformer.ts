import { ValueTransformer } from 'typeorm';
import { decryptString, encryptString, keyFromHex } from '../crypto/aes';

export class EncryptedTransformer implements ValueTransformer {
  private key: Buffer | null = null;

  private getKey(): Buffer {
    this.key ??= keyFromHex(process.env.ENCRYPTION_KEY ?? '');
    return this.key;
  }

  to(value: string | null | undefined): string | null | undefined {
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
