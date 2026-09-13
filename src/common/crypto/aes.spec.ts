import { describe, expect, it } from 'vitest';
import { decryptString, encryptString, keyFromHex } from './aes';

const KEY = keyFromHex('a'.repeat(64));
const OTHER_KEY = keyFromHex('b'.repeat(64));

describe('aes-256-gcm helpers', () => {
  it('round-trips utf-8 content', () => {
    const plaintext = '+994 50 123 45 67 — Şamil Əliyev';
    const encrypted = encryptString(plaintext, KEY);
    expect(encrypted).not.toContain('123');
    expect(decryptString(encrypted, KEY)).toBe(plaintext);
  });

  it('produces a different ciphertext per call (random IV)', () => {
    const a = encryptString('same input', KEY);
    const b = encryptString('same input', KEY);
    expect(a).not.toBe(b);
  });

  it('rejects tampered payloads', () => {
    const encrypted = encryptString('secret', KEY);
    const raw = Buffer.from(encrypted, 'base64');
    raw[raw.length - 1] ^= 0xff;
    expect(() => decryptString(raw.toString('base64'), KEY)).toThrow();
  });

  it('rejects the wrong key', () => {
    const encrypted = encryptString('secret', KEY);
    expect(() => decryptString(encrypted, OTHER_KEY)).toThrow();
  });

  it('rejects malformed keys', () => {
    expect(() => keyFromHex('deadbeef')).toThrow(/64 hex/);
  });
});
