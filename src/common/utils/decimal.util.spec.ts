import { describe, expect, it } from 'vitest';
import { add, convert, money, sub, total } from './decimal.util';

describe('decimal.util', () => {
  it('rounds money to 2 decimals (half-up)', () => {
    expect(money(1.005)).toBe(1.01);
    expect(money(1.004)).toBe(1);
    expect(money('41000')).toBe(41000);
  });

  it('computes volume × price without float drift', () => {
    expect(total(205, 200)).toBe(41000);
    expect(total(0.1, 0.2)).toBe(0.02);
    // Classic float trap: 0.1 * 3 = 0.30000000000000004 in raw JS
    expect(total(0.1, 3)).toBe(0.3);
    expect(total(205.5, 199.99)).toBe(41097.95);
  });

  it('adds and subtracts exactly', () => {
    expect(add(0.1, 0.2)).toBe(0.3);
    expect(sub(1, 0.9)).toBe(0.1);
    expect(add(-41000, 40000)).toBe(-1000);
  });

  it('converts between primary and secondary currencies', () => {
    // 1 USD = 1.70 AZN
    expect(convert(1000, 1.7, 'toSecondary')).toBe(1700);
    expect(convert(1000, 1.7, 'toPrimary')).toBe(588.24);
    expect(convert(1700, 1.7, 'toPrimary')).toBe(1000);
  });
});
