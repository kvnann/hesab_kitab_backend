import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Repository } from 'typeorm';
import { Currency, SecondaryCurrency } from '../../common/enums';
import { Settings } from './entities/settings.entity';
import { SettingsService } from './settings.service';

function makeService(settings: Settings): SettingsService {
  const repository = {
    findOneBy: vi.fn().mockResolvedValue(settings),
    save: vi.fn().mockImplementation((entity: Settings) => Promise.resolve(entity)),
  } as unknown as Repository<Settings>;
  return new SettingsService(repository);
}

function makeSettings(): Settings {
  const settings = new Settings();
  settings.userId = 'user-id';
  settings.primaryCurrency = Currency.DOLLAR;
  settings.secondaryCurrency = SecondaryCurrency.MANAT;
  settings.exchangeRate = 1.7;
  settings.lastChangedDate = new Date('2026-01-01T00:00:00Z');
  return settings;
}

describe('SettingsService.update', () => {
  it('bumps lastChangedDate only when the rate actually changes', async () => {
    const service = makeService(makeSettings());
    const before = new Date('2026-01-01T00:00:00Z');

    const unchanged = await service.update('user-id', { exchangeRate: 1.7 });
    expect(unchanged.lastChangedDate).toEqual(before);

    const changed = await service.update('user-id', { exchangeRate: 1.75 });
    expect(changed.exchangeRate).toBe(1.75);
    expect(changed.lastChangedDate.getTime()).toBeGreaterThan(before.getTime());
  });

  it('rejects identical primary and secondary currencies', async () => {
    const service = makeService(makeSettings());
    await expect(
      service.update('user-id', { secondaryCurrency: SecondaryCurrency.DOLLAR }),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows switching both currencies together', async () => {
    const service = makeService(makeSettings());
    const updated = await service.update('user-id', {
      primaryCurrency: Currency.MANAT,
      secondaryCurrency: SecondaryCurrency.DOLLAR,
    });
    expect(updated.primaryCurrency).toBe(Currency.MANAT);
    expect(updated.secondaryCurrency).toBe(SecondaryCurrency.DOLLAR);
  });
});
