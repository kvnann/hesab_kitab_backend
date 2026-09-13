import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { Currency, SecondaryCurrency } from '../../common/enums';
import { Settings } from '../settings/entities/settings.entity';
import { ContactLedgerService } from './contact-ledger.service';

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  const settings = new Settings();
  settings.primaryCurrency = Currency.DOLLAR;
  settings.secondaryCurrency = SecondaryCurrency.MANAT;
  settings.exchangeRate = 1.7;
  Object.assign(settings, overrides);
  return settings;
}

describe('ContactLedgerService.toPrimary', () => {
  const service = new ContactLedgerService();

  it('returns the amount unchanged when already in the primary currency', () => {
    expect(service.toPrimary(41000, Currency.DOLLAR, makeSettings())).toBe(41000);
  });

  it('converts secondary-currency amounts using the manual rate', () => {
    // 1700 AZN at 1 USD = 1.70 AZN → 1000 USD
    expect(service.toPrimary(1700, Currency.MANAT, makeSettings())).toBe(1000);
  });

  it('supports manat as the primary currency', () => {
    const settings = makeSettings({
      primaryCurrency: Currency.MANAT,
      secondaryCurrency: SecondaryCurrency.DOLLAR,
      exchangeRate: 0.59,
    });
    expect(service.toPrimary(100, Currency.MANAT, settings)).toBe(100);
    expect(service.toPrimary(59, Currency.DOLLAR, settings)).toBe(100);
  });

  it('rejects a currency with no configured rate', () => {
    const settings = makeSettings({ secondaryCurrency: SecondaryCurrency.EURO });
    expect(() => service.toPrimary(100, Currency.MANAT, settings)).toThrow(
      BadRequestException,
    );
  });
});
