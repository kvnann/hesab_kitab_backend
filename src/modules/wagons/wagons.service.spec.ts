import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { DataSource, Repository } from 'typeorm';
import { Currency } from '../../common/enums';
import { ContactLedgerService } from '../contacts/contact-ledger.service';
import { CreateWagonDto } from './dto/wagon.dto';
import { Wagon } from './entities/wagon.entity';
import { WagonsService } from './wagons.service';

// Validation runs before any database access, so stubs are never touched.
const service = new WagonsService(
  {} as DataSource,
  new ContactLedgerService(),
  {} as Repository<Wagon>,
);

function dto(partial: Partial<CreateWagonDto>): CreateWagonDto {
  return { name: 'Vaqon No. 676', ...partial };
}

describe('WagonsService side validation', () => {
  it('rejects a wagon with neither buy nor sell details', async () => {
    await expect(service.create('user-id', dto({}))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects buy volume without buy price', async () => {
    await expect(
      service.create('user-id', dto({ buyVolume: 205 })),
    ).rejects.toThrow(/together/);
  });

  it('rejects sell price without sell volume', async () => {
    await expect(
      service.create('user-id', dto({ sellPrice: 200 })),
    ).rejects.toThrow(/together/);
  });

  it('accepts a complete buy side without a sell side', () => {
    // Passing validation means reaching the (stubbed) datasource and failing there.
    return expect(
      service.create('user-id', dto({ buyVolume: 205, buyPrice: 200 })),
    ).rejects.not.toThrow(BadRequestException);
  });
});

describe('Wagon computed totals', () => {
  it('computes buyTotal, sellTotal and difference', () => {
    const wagon = new Wagon();
    wagon.currency = Currency.DOLLAR;
    wagon.buyVolume = 205;
    wagon.buyPrice = 200;
    wagon.sellVolume = 200;
    wagon.sellPrice = 200;
    expect(wagon.buyTotal).toBe(41000);
    expect(wagon.sellTotal).toBe(40000);
    expect(wagon.difference).toBe(-1000);
  });

  it('returns null totals for a missing side', () => {
    const wagon = new Wagon();
    wagon.buyVolume = 205;
    wagon.buyPrice = 200;
    wagon.sellVolume = null;
    wagon.sellPrice = null;
    expect(wagon.buyTotal).toBe(41000);
    expect(wagon.sellTotal).toBeNull();
    expect(wagon.difference).toBeNull();
  });
});
