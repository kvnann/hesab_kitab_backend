import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  Currency,
  CustomsPayer,
  TransactionSource,
  TransactionType,
  WagonSide,
} from '../../common/enums';
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
        // Resolved once here: every balance calculation below reads
        // wagon.currency, and an undefined one would reach the converter.
        currency: dto.currency ?? Currency.DOLLAR,
        status: dto.status,
        buyVolume: dto.buyVolume ?? null,
        buyPrice: dto.buyPrice ?? null,
        sellVolume: dto.sellVolume ?? null,
        sellPrice: dto.sellPrice ?? null,
        buyThroughCash: dto.buyThroughCash ?? false,
        sellThroughCash: dto.sellThroughCash ?? false,
        location: dto.location ?? undefined,
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
            wagon.currency,
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
            wagon.currency,
            settings,
          );
          await this.ledger.applyDelta(manager, contact, delta);
          wagon.sellAppliedAmount = delta;
        }
      }

      wagon.customsExpense = dto.customsExpense ?? null;
      wagon.customsPayer = dto.customsPayer ?? null;
      this.assertCustoms(wagon);
      await this.applyCustoms(manager, userId, wagon, settings);

      const saved = await repo.save(wagon);
      await this.syncSideTransaction(manager, userId, saved, 'buy');
      await this.syncSideTransaction(manager, userId, saved, 'sell');
      await this.syncSideTransaction(manager, userId, saved, 'customs');
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
        if (dto.location !== undefined) wagon.location = dto.location;
        if (dto.description !== undefined) wagon.description = dto.description;
        if (dto.buyThroughCash !== undefined) wagon.buyThroughCash = dto.buyThroughCash;
        if (dto.sellThroughCash !== undefined) {
          wagon.sellThroughCash = dto.sellThroughCash;
        }
        await repo.save(wagon);
        // Rows carry the wagon name in their text and the till flag in their
        // cash amount, so either change means rewriting them.
        if (
          renamed ||
          dto.buyThroughCash !== undefined ||
          dto.sellThroughCash !== undefined
        ) {
          await this.syncSideTransaction(manager, userId, wagon, 'buy');
          await this.syncSideTransaction(manager, userId, wagon, 'sell');
          await this.syncSideTransaction(manager, userId, wagon, 'customs');
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
      await this.reverseCustoms(manager, userId, wagon);

      // 2. Merge scalar changes.
      if (dto.name !== undefined) wagon.name = dto.name.trim();
      if (dto.currency !== undefined) wagon.currency = dto.currency;
      if (dto.status !== undefined) wagon.status = dto.status;
      if (dto.location !== undefined) wagon.location = dto.location;
      if (dto.description !== undefined) wagon.description = dto.description;
      if (dto.buyThroughCash !== undefined) wagon.buyThroughCash = dto.buyThroughCash;
      if (dto.sellThroughCash !== undefined) wagon.sellThroughCash = dto.sellThroughCash;

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

      // 4b. Merge customs. An explicit null (or 0) clears it along with its payer.
      if (dto.customsExpense !== undefined) {
        wagon.customsExpense = dto.customsExpense;
      }
      if (dto.customsPayer !== undefined) {
        wagon.customsPayer = dto.customsPayer;
      }
      if (!wagon.customsExpense) {
        wagon.customsExpense = null;
        wagon.customsPayer = null;
      }
      this.assertCustoms(wagon);

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

      await this.applyCustoms(manager, userId, wagon, settings);

      await repo.save(wagon);
      await this.syncSideTransaction(manager, userId, wagon, 'buy');
      await this.syncSideTransaction(manager, userId, wagon, 'sell');
      await this.syncSideTransaction(manager, userId, wagon, 'customs');
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
      await this.reverseCustoms(manager, userId, wagon);
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
    side: WagonLedgerSide,
  ): Promise<void> {
    const repo = manager.getRepository(Transaction);
    const spec = LEDGER_SIDES[side];
    const contactId = spec.contactId(this, wagon);
    const applied = spec.applied(wagon);
    const amount = spec.amount(wagon);
    const description = `${spec.prefix} - ${wagon.name}`;

    const existing = await repo.find({
      where: { userId, wagonId: wagon.id, source: TransactionSource.WAGON },
    });
    const mine = existing.filter((row) => row.wagonSide === spec.side);
    if (mine.length > 0) {
      await repo.delete(mine.map((row) => row.id));
    }

    // Nothing to show when the side has no contact, no numbers, or was
    // recorded as a cash deal that never touched a balance.
    if (!contactId || applied === null || applied === 0 || !amount) return;

    await repo.save(
      repo.create({
        userId,
        // For a wagon row the type carries the direction of the debt movement:
        // 'income' means the contact's balance fell, 'expense' that it rose.
        // These rows never enter the cash totals — `source` keeps them out.
        type: applied < 0 ? TransactionType.INCOME : TransactionType.EXPENSE,
        amount,
        currency: wagon.currency,
        date: toIsoDate(new Date()),
        contactId,
        wagonId: wagon.id,
        description,
        affectsBalance: false,
        balanceAppliedAmount: null,
        source: TransactionSource.WAGON,
        wagonSide: spec.side,
        affectsCash: spec.throughCash(wagon),
        // Paying for goods empties the till; selling them fills it. Customs is
        // never a till operation.
        cashAppliedAmount: spec.throughCash(wagon) ? spec.cashSign * amount : null,
      }),
    );
  }

  /** Same as {@link customsContactId}, reachable from the side descriptors. */
  customsContactForRow(wagon: Wagon): string | null {
    return this.customsContactId(wagon);
  }

  /** The contact who carries customs: the buyer's side or the seller's side. */
  private customsContactId(wagon: Wagon): string | null {
    if (!wagon.customsPayer) return null;
    return wagon.customsPayer === CustomsPayer.BUYER
      ? wagon.soldToContactId
      : wagon.boughtFromContactId;
  }

  /**
   * A customs cost needs somebody to carry it, and that somebody has to be a
   * named contact on the matching side — otherwise the amount would be recorded
   * against nobody and silently vanish from the ledger.
   */
  private assertCustoms(wagon: Wagon): void {
    const amount = wagon.customsExpense ?? 0;
    if (amount <= 0) return;

    if (!wagon.customsPayer) {
      throw new BadRequestException(
        'Gömrük xərci üçün ödəyicini seçin: Alıcı və ya Satıcı',
      );
    }
    if (!this.customsContactId(wagon)) {
      throw new BadRequestException(
        wagon.customsPayer === CustomsPayer.BUYER
          ? 'Gömrüyü alıcı ödəyirsə, vaqonun "kimə satılıb" hissəsi doldurulmalıdır'
          : 'Gömrüyü satıcı ödəyirsə, vaqonun "kimdən alınıb" hissəsi doldurulmalıdır',
      );
    }
  }

  /**
   * Customs is money we laid out, so whoever carries it owes us that much more
   * (equivalently, we owe the seller that much less): a positive delta either
   * way, just against a different contact.
   */
  private async applyCustoms(
    manager: EntityManager,
    userId: string,
    wagon: Wagon,
    settings: Settings,
  ): Promise<void> {
    wagon.customsAppliedAmount = null;
    const amount = wagon.customsExpense ?? 0;
    const contactId = this.customsContactId(wagon);
    if (amount <= 0 || !contactId) return;

    const contact = await this.ledger.lockContact(manager, userId, contactId);
    if (!contact) return;

    const delta = this.ledger.toPrimary(amount, wagon.currency, settings);
    await this.ledger.applyDelta(manager, contact, delta);
    wagon.customsAppliedAmount = delta;
  }

  private async reverseCustoms(
    manager: EntityManager,
    userId: string,
    wagon: Wagon,
  ): Promise<void> {
    const applied = wagon.customsAppliedAmount;
    const contactId = this.customsContactId(wagon);
    if (applied === null || applied === 0 || !contactId) return;

    const contact = await this.ledger.lockContact(manager, userId, contactId);
    if (contact) await this.ledger.applyDelta(manager, contact, -applied);
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
      dto.customsExpense !== undefined ||
      dto.customsPayer !== undefined ||
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

/** The three things on a wagon that can move a contact's balance. */
type WagonLedgerSide = 'buy' | 'sell' | 'customs';

interface LedgerSideSpec {
  side: WagonSide;
  /** Text shown on the contact's page, before " - <wagon name>". */
  prefix: string;
  contactId: (service: WagonsService, wagon: Wagon) => string | null;
  applied: (wagon: Wagon) => number | null;
  amount: (wagon: Wagon) => number | null;
  /** Whether this side was settled through the till. */
  throughCash: (wagon: Wagon) => boolean;
  /** Direction on the till: −1 pays out, +1 takes in. */
  cashSign: -1 | 1;
}

const LEDGER_SIDES: Record<WagonLedgerSide, LedgerSideSpec> = {
  buy: {
    side: WagonSide.BUY,
    prefix: 'Mal alışı',
    contactId: (_service, wagon) => wagon.boughtFromContactId,
    applied: (wagon) => wagon.buyAppliedAmount,
    amount: (wagon) => wagon.buyTotal,
    throughCash: (wagon) => wagon.buyThroughCash,
    cashSign: -1,
  },
  sell: {
    side: WagonSide.SELL,
    prefix: 'Mal satışı',
    contactId: (_service, wagon) => wagon.soldToContactId,
    applied: (wagon) => wagon.sellAppliedAmount,
    amount: (wagon) => wagon.sellTotal,
    throughCash: (wagon) => wagon.sellThroughCash,
    cashSign: 1,
  },
  customs: {
    side: WagonSide.CUSTOMS,
    prefix: 'Gömrük xərci',
    contactId: (service, wagon) => service.customsContactForRow(wagon),
    applied: (wagon) => wagon.customsAppliedAmount,
    amount: (wagon) => wagon.customsExpense,
    throughCash: () => false,
    cashSign: -1,
  },
};
