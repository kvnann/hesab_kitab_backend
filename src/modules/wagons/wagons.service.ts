import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Currency, TransactionSource, TransactionType } from '../../common/enums';
import { total } from '../../common/utils/decimal.util';
import { ContactLedgerService } from '../contacts/contact-ledger.service';
import { Settings } from '../settings/entities/settings.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { CreateWagonDto, ListWagonsDto, UpdateWagonDto } from './dto/wagon.dto';
import { Wagon } from './entities/wagon.entity';

@Injectable()
export class WagonsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly ledger: ContactLedgerService,
    @InjectRepository(Wagon)
    private readonly wagonsRepository: Repository<Wagon>,
  ) {}

  async create(userId: string, dto: CreateWagonDto): Promise<Wagon> {
    this.assertSidePairs(dto.buyVolume ?? null, dto.buyPrice ?? null, dto.sellVolume ?? null, dto.sellPrice ?? null);

    const wagonId = await this.dataSource.transaction(async (manager) => {
      const settings = await this.getSettings(manager, userId);
      const repo = manager.getRepository(Wagon);
      const wagon = repo.create({
        userId,
        name: dto.name.trim(),
        currency: dto.currency,
        status: dto.status,
        buyVolume: dto.buyVolume ?? null,
        buyPrice: dto.buyPrice ?? null,
        sellVolume: dto.sellVolume ?? null,
        sellPrice: dto.sellPrice ?? null,
        description: dto.description ?? null,
      });

      if (this.hasBuySide(wagon) && dto.boughtFrom) {
        const contact = await this.ledger.findOrCreateByName(
          manager,
          userId,
          dto.boughtFrom,
        );
        wagon.boughtFromContactId = contact.id;
        if (dto.applyBuyToBalance !== false) {
          // Buying on credit: we owe the seller → their owes_us decreases.
          const delta = -this.ledger.toPrimary(
            total(wagon.buyVolume as number, wagon.buyPrice as number),
            wagon.currency ?? Currency.DOLLAR,
            settings,
          );
          await this.ledger.applyDelta(manager, contact, delta);
          wagon.buyAppliedAmount = delta;
        }
      }

      if (this.hasSellSide(wagon) && dto.soldTo) {
        const contact = await this.ledger.findOrCreateByName(manager, userId, dto.soldTo);
        wagon.soldToContactId = contact.id;
        if (dto.applySellToBalance !== false) {
          // Selling on credit: the buyer owes us → their owes_us increases.
          const delta = this.ledger.toPrimary(
            total(wagon.sellVolume as number, wagon.sellPrice as number),
            wagon.currency ?? Currency.DOLLAR,
            settings,
          );
          await this.ledger.applyDelta(manager, contact, delta);
          wagon.sellAppliedAmount = delta;
        }
      }

      const saved = await repo.save(wagon);
      await this.syncSideTransaction(manager, userId, saved, 'buy');
      await this.syncSideTransaction(manager, userId, saved, 'sell');
      return saved.id;
    });

    return this.findOne(userId, wagonId);
  }

  async findAll(userId: string, filter: ListWagonsDto): Promise<Wagon[]> {
    return this.wagonsRepository.find({
      where: { userId, ...(filter.status ? { status: filter.status } : {}) },
      relations: { boughtFrom: true, soldTo: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(userId: string, id: string): Promise<Wagon> {
    const wagon = await this.wagonsRepository.findOne({
      where: { id, userId },
      relations: { boughtFrom: true, soldTo: true },
    });
    if (!wagon) throw new NotFoundException('Wagon not found');
    return wagon;
  }

  /**
   * Update strategy: reverse every previously applied balance effect, merge
   * the changes, then re-apply. Simple to reason about and always consistent,
   * at the cost of touching contact rows even for unrelated edits.
   */
  async update(userId: string, id: string, dto: UpdateWagonDto): Promise<Wagon> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Wagon);
      const wagon = await repo
        .createQueryBuilder('wagon')
        .setLock('pessimistic_write')
        .where('wagon.id = :id AND wagon.user_id = :userId', { id, userId })
        .getOne();
      if (!wagon) throw new NotFoundException('Wagon not found');

      // Metadata-only edits (archive/restore, rename, description) must not run
      // the reverse/re-apply cycle: re-applying converts with the *current*
      // exchange rate, which would silently shift balances if the rate moved.
      if (!this.touchesBalance(dto)) {
        const renamed = dto.name !== undefined && dto.name.trim() !== wagon.name;
        if (dto.name !== undefined) wagon.name = dto.name.trim();
        if (dto.status !== undefined) wagon.status = dto.status;
        if (dto.description !== undefined) wagon.description = dto.description;
        await repo.save(wagon);
        // The generated rows carry the wagon name in their text.
        if (renamed) {
          await this.syncSideTransaction(manager, userId, wagon, 'buy');
          await this.syncSideTransaction(manager, userId, wagon, 'sell');
        }
        return;
      }

      const settings = await this.getSettings(manager, userId);
      const hadBuySide = this.hasBuySide(wagon);
      const hadSellSide = this.hasSellSide(wagon);
      // Captured before the merge below rewrites the contact columns. A side
      // that had no contact was never "chosen" not to affect a balance — there
      // was simply nobody to affect.
      const hadBuyContact = wagon.boughtFromContactId !== null;
      const hadSellContact = wagon.soldToContactId !== null;

      // 1. Reverse prior effects (skip when the contact has been deleted).
      await this.reverseSide(manager, userId, wagon, 'buy');
      await this.reverseSide(manager, userId, wagon, 'sell');

      // 2. Merge scalar changes.
      if (dto.name !== undefined) wagon.name = dto.name.trim();
      if (dto.currency !== undefined) wagon.currency = dto.currency;
      if (dto.status !== undefined) wagon.status = dto.status;
      if (dto.description !== undefined) wagon.description = dto.description;

      const wasBuyApplied = wagon.buyAppliedAmount !== null;
      const wasSellApplied = wagon.sellAppliedAmount !== null;
      wagon.buyAppliedAmount = null;
      wagon.sellAppliedAmount = null;

      // 3. Merge buy side.
      if (dto.buyVolume === null || dto.buyPrice === null) {
        wagon.buyVolume = null;
        wagon.buyPrice = null;
        wagon.boughtFromContactId = null;
      } else {
        if (dto.buyVolume !== undefined) wagon.buyVolume = dto.buyVolume;
        if (dto.buyPrice !== undefined) wagon.buyPrice = dto.buyPrice;
      }
      if (dto.boughtFrom === null) {
        wagon.boughtFromContactId = null;
      } else if (dto.boughtFrom !== undefined) {
        const contact = await this.ledger.findOrCreateByName(
          manager,
          userId,
          dto.boughtFrom,
        );
        wagon.boughtFromContactId = contact.id;
      }

      // 4. Merge sell side.
      if (dto.sellVolume === null || dto.sellPrice === null) {
        wagon.sellVolume = null;
        wagon.sellPrice = null;
        wagon.soldToContactId = null;
      } else {
        if (dto.sellVolume !== undefined) wagon.sellVolume = dto.sellVolume;
        if (dto.sellPrice !== undefined) wagon.sellPrice = dto.sellPrice;
      }
      if (dto.soldTo === null) {
        wagon.soldToContactId = null;
      } else if (dto.soldTo !== undefined) {
        const contact = await this.ledger.findOrCreateByName(manager, userId, dto.soldTo);
        wagon.soldToContactId = contact.id;
      }

      this.assertSidePairs(
        wagon.buyVolume,
        wagon.buyPrice,
        wagon.sellVolume,
        wagon.sellPrice,
      );

      // 5. Re-apply balance effects on the merged state. Defaults: a side that
      // already had a contact keeps its previous applied/not-applied choice
      // (that is how a cash deal stays a cash deal); a side that is new, or
      // that is only now getting a contact, applies automatically.
      const applyBuy =
        dto.applyBuyToBalance ?? (hadBuySide && hadBuyContact ? wasBuyApplied : true);
      if (this.hasBuySide(wagon) && wagon.boughtFromContactId && applyBuy) {
        const contact = await this.ledger.lockContact(
          manager,
          userId,
          wagon.boughtFromContactId,
        );
        if (contact) {
          const delta = -this.ledger.toPrimary(
            total(wagon.buyVolume as number, wagon.buyPrice as number),
            wagon.currency,
            settings,
          );
          await this.ledger.applyDelta(manager, contact, delta);
          wagon.buyAppliedAmount = delta;
        }
      }

      const applySell =
        dto.applySellToBalance ?? (hadSellSide && hadSellContact ? wasSellApplied : true);
      if (this.hasSellSide(wagon) && wagon.soldToContactId && applySell) {
        const contact = await this.ledger.lockContact(
          manager,
          userId,
          wagon.soldToContactId,
        );
        if (contact) {
          const delta = this.ledger.toPrimary(
            total(wagon.sellVolume as number, wagon.sellPrice as number),
            wagon.currency,
            settings,
          );
          await this.ledger.applyDelta(manager, contact, delta);
          wagon.sellAppliedAmount = delta;
        }
      }

      await repo.save(wagon);
      await this.syncSideTransaction(manager, userId, wagon, 'buy');
      await this.syncSideTransaction(manager, userId, wagon, 'sell');
    });

    return this.findOne(userId, id);
  }

  /** Delete the wagon, reversing any balance effects it applied. */
  async remove(userId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Wagon);
      const wagon = await repo
        .createQueryBuilder('wagon')
        .setLock('pessimistic_write')
        .where('wagon.id = :id AND wagon.user_id = :userId', { id, userId })
        .getOne();
      if (!wagon) throw new NotFoundException('Wagon not found');

      await this.reverseSide(manager, userId, wagon, 'buy');
      await this.reverseSide(manager, userId, wagon, 'sell');
      await manager.getRepository(Transaction).delete({
        userId,
        wagonId: wagon.id,
        source: TransactionSource.WAGON,
      });
      await repo.delete({ id: wagon.id });
    });
  }

  /**
   * Mirror one wagon side into a transaction on the contact's page, so the
   * balance change has a visible reason ("Mal alışı - 676") instead of moving
   * on its own. The row documents the wagon's effect; it never applies one of
   * its own (affectsBalance is false) and never counts towards the till.
   *
   * Rewritten from scratch on every save: one row per side at most, gone as
   * soon as the side loses its contact, its numbers, or its balance effect.
   */
  private async syncSideTransaction(
    manager: EntityManager,
    userId: string,
    wagon: Wagon,
    side: 'buy' | 'sell',
  ): Promise<void> {
    const repo = manager.getRepository(Transaction);
    const contactId =
      side === 'buy' ? wagon.boughtFromContactId : wagon.soldToContactId;
    const applied = side === 'buy' ? wagon.buyAppliedAmount : wagon.sellAppliedAmount;
    const sideTotal = side === 'buy' ? wagon.buyTotal : wagon.sellTotal;
    const description = `${side === 'buy' ? 'Mal alışı' : 'Mal satışı'} - ${wagon.name}`;

    const existing = await repo.find({
      where: { userId, wagonId: wagon.id, source: TransactionSource.WAGON },
    });
    const mine = existing.filter((row) =>
      side === 'buy'
        ? row.description?.startsWith('Mal alışı')
        : row.description?.startsWith('Mal satışı'),
    );
    if (mine.length > 0) {
      await repo.delete(mine.map((row) => row.id));
    }

    // Nothing to show when the side has no contact, no numbers, or was
    // recorded as a cash deal that never touched a balance.
    if (!contactId || applied === null || applied === 0 || sideTotal === null) return;

    await repo.save(
      repo.create({
        userId,
        type: TransactionType.OTHER,
        amount: sideTotal,
        currency: wagon.currency,
        date: toIsoDate(new Date()),
        contactId,
        wagonId: wagon.id,
        description,
        affectsBalance: false,
        balanceAppliedAmount: null,
        source: TransactionSource.WAGON,
      }),
    );
  }

  private async reverseSide(
    manager: EntityManager,
    userId: string,
    wagon: Wagon,
    side: 'buy' | 'sell',
  ): Promise<void> {
    const applied = side === 'buy' ? wagon.buyAppliedAmount : wagon.sellAppliedAmount;
    const contactId =
      side === 'buy' ? wagon.boughtFromContactId : wagon.soldToContactId;
    if (applied === null || applied === 0 || !contactId) return;

    const contact = await this.ledger.lockContact(manager, userId, contactId);
    if (contact) {
      await this.ledger.applyDelta(manager, contact, -applied);
    }
  }

  private async getSettings(manager: EntityManager, userId: string): Promise<Settings> {
    const settings = await manager.getRepository(Settings).findOneBy({ userId });
    if (!settings) throw new NotFoundException('Settings not found');
    return settings;
  }

  /** True when the update can change what was applied to a contact's balance. */
  private touchesBalance(dto: UpdateWagonDto): boolean {
    return (
      dto.buyVolume !== undefined ||
      dto.buyPrice !== undefined ||
      dto.boughtFrom !== undefined ||
      dto.applyBuyToBalance !== undefined ||
      dto.sellVolume !== undefined ||
      dto.sellPrice !== undefined ||
      dto.soldTo !== undefined ||
      dto.applySellToBalance !== undefined ||
      dto.currency !== undefined
    );
  }

  private hasBuySide(wagon: Wagon): boolean {
    return wagon.buyVolume !== null && wagon.buyPrice !== null;
  }

  private hasSellSide(wagon: Wagon): boolean {
    return wagon.sellVolume !== null && wagon.sellPrice !== null;
  }

  private assertSidePairs(
    buyVolume: number | null,
    buyPrice: number | null,
    sellVolume: number | null,
    sellPrice: number | null,
  ): void {
    const buyVolumeSet = buyVolume !== null && buyVolume !== undefined;
    const buyPriceSet = buyPrice !== null && buyPrice !== undefined;
    const sellVolumeSet = sellVolume !== null && sellVolume !== undefined;
    const sellPriceSet = sellPrice !== null && sellPrice !== undefined;

    if (buyVolumeSet !== buyPriceSet) {
      throw new BadRequestException('Buy volume and buy price must be provided together');
    }
    if (sellVolumeSet !== sellPriceSet) {
      throw new BadRequestException(
        'Sell volume and sell price must be provided together',
      );
    }
    if (!buyVolumeSet && !sellVolumeSet) {
      throw new BadRequestException(
        'A wagon needs buying details, selling details, or both',
      );
    }
  }
}

/** Local calendar date (YYYY-MM-DD), matching the transactions date column. */
function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
