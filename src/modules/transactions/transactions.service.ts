import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Paginated, paginate } from '../../common/dto/pagination.dto';
import {
  Currency,
  TransactionSource,
  TransactionType,
  WagonSide,
} from '../../common/enums';
import { money } from '../../common/utils/decimal.util';
import { ContactLedgerService } from '../contacts/contact-ledger.service';
import { Settings } from '../settings/entities/settings.entity';
import { Wagon } from '../wagons/entities/wagon.entity';
import {
  CreateTransactionDto,
  ListTransactionsDto,
  MonthSummaryDto,
  UpdateTransactionDto,
} from './dto/transaction.dto';
import { Transaction } from './entities/transaction.entity';

export interface DaySummary {
  date: string;
  income: number;
  expense: number;
  other: number;
  net: number;
  count: number;
}

export interface CashSummary {
  income: number;
  expense: number;
  net: number;
}

export interface MonthSummary {
  year: number;
  month: number;
  income: number;
  expense: number;
  other: number;
  net: number;
  days: DaySummary[];
}

@Injectable()
export class TransactionsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly ledger: ContactLedgerService,
    @InjectRepository(Transaction)
    private readonly transactionsRepository: Repository<Transaction>,
  ) {}

  async create(userId: string, dto: CreateTransactionDto): Promise<Transaction> {
    const transactionId = await this.dataSource.transaction(async (manager) => {
      if (dto.wagonId) await this.assertWagonOwned(manager, userId, dto.wagonId);

      let contactId = dto.contactId ?? null;
      if (!contactId && dto.contactName) {
        const contact = await this.ledger.findOrCreateByName(
          manager,
          userId,
          dto.contactName,
        );
        contactId = contact.id;
      }

      const repo = manager.getRepository(Transaction);
      const transaction = repo.create({
        userId,
        type: dto.type,
        amount: money(dto.amount),
        currency: dto.currency ?? Currency.DOLLAR,
        date: dto.date,
        contactId,
        wagonId: dto.wagonId ?? null,
        description: dto.description ?? null,
        affectsBalance: dto.affectsBalance ?? true,
        affectsCash: dto.affectsCash ?? false,
      });

      await this.applyBalanceEffect(manager, userId, transaction);
      await this.applyCashEffect(manager, userId, transaction);
      const saved = await repo.save(transaction);
      return saved.id;
    });

    return this.findOne(userId, transactionId);
  }

  async findAll(
    userId: string,
    filter: ListTransactionsDto,
  ): Promise<Paginated<Transaction>> {
    const qb = this.transactionsRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.contact', 'contact')
      .leftJoinAndSelect('transaction.wagon', 'wagon')
      .where('transaction.user_id = :userId', { userId })
      .orderBy('transaction.date', 'DESC')
      .addOrderBy('transaction.createdAt', 'DESC');

    if (filter.date) {
      qb.andWhere('transaction.date = :date', { date: filter.date });
    } else {
      if (filter.from) qb.andWhere('transaction.date >= :from', { from: filter.from });
      if (filter.to) qb.andWhere('transaction.date <= :to', { to: filter.to });
    }
    if (filter.type) qb.andWhere('transaction.type = :type', { type: filter.type });
    if (filter.contactId) {
      qb.andWhere('transaction.contact_id = :contactId', { contactId: filter.contactId });
    }
    if (filter.wagonId) {
      qb.andWhere('transaction.wagon_id = :wagonId', { wagonId: filter.wagonId });
    }
    if (filter.source) {
      qb.andWhere('transaction.source = :source', { source: filter.source });
    }
    if (filter.affectsCash !== undefined) {
      qb.andWhere('transaction.affects_cash = :affectsCash', {
        affectsCash: filter.affectsCash,
      });
    }

    const [items, total] = await qb
      .skip((filter.page - 1) * filter.limit)
      .take(filter.limit)
      .getManyAndCount();

    return paginate(items, total, filter);
  }

  async monthSummary(userId: string, dto: MonthSummaryDto): Promise<MonthSummary> {
    const settings = await this.dataSource
      .getRepository(Settings)
      .findOneByOrFail({ userId });

    const monthStart = `${dto.year}-${String(dto.month).padStart(2, '0')}-01`;

    const primaryAmount = `
      CASE WHEN transaction.currency = :primaryCurrency
           THEN transaction.amount
           ELSE ROUND(transaction.amount / :exchangeRate, 2)
      END`;

    const rows = await this.transactionsRepository
      .createQueryBuilder('transaction')
      .select('transaction.date::text', 'date')
      .addSelect(
        `COALESCE(SUM(${primaryAmount}) FILTER (WHERE transaction.type = 'income'), 0)`,
        'income',
      )
      .addSelect(
        `COALESCE(SUM(${primaryAmount}) FILTER (WHERE transaction.type = 'expense'), 0)`,
        'expense',
      )
      .addSelect(
        `COALESCE(SUM(${primaryAmount}) FILTER (WHERE transaction.type = 'other'), 0)`,
        'other',
      )
      .addSelect('COUNT(*)', 'count')
      .where('transaction.user_id = :userId', { userId })
      .andWhere('transaction.source = :manual', { manual: TransactionSource.MANUAL })
      .andWhere('transaction.date >= :monthStart::date', { monthStart })
      .andWhere("transaction.date < :monthStart::date + interval '1 month'", {
        monthStart,
      })
      .setParameters({
        primaryCurrency: settings.primaryCurrency,
        exchangeRate: settings.exchangeRate,
      })
      .groupBy('transaction.date')
      .orderBy('transaction.date', 'ASC')
      .getRawMany<{
        date: string;
        income: string;
        expense: string;
        other: string;
        count: string;
      }>();

    const days: DaySummary[] = rows.map((row) => {
      const income = money(row.income);
      const expense = money(row.expense);
      return {
        date: typeof row.date === 'string' ? row.date : formatDate(row.date),
        income,
        expense,
        other: money(row.other),
        net: money(income - expense),
        count: parseInt(row.count, 10),
      };
    });

    const income = money(days.reduce((sum, d) => sum + d.income, 0));
    const expense = money(days.reduce((sum, d) => sum + d.expense, 0));
    return {
      year: dto.year,
      month: dto.month,
      income,
      expense,
      other: money(days.reduce((sum, d) => sum + d.other, 0)),
      net: money(income - expense),
      days,
    };
  }

  async cashSummary(userId: string): Promise<CashSummary> {
    const raw = await this.transactionsRepository
      .createQueryBuilder('transaction')
      .select(
        'COALESCE(SUM(transaction.cash_applied_amount) FILTER (WHERE transaction.cash_applied_amount > 0), 0)',
        'income',
      )
      .addSelect(
        'COALESCE(-SUM(transaction.cash_applied_amount) FILTER (WHERE transaction.cash_applied_amount < 0), 0)',
        'expense',
      )
      .addSelect('COALESCE(SUM(transaction.cash_applied_amount), 0)', 'net')
      .where('transaction.user_id = :userId', { userId })
      .getRawOne<{ income: string; expense: string; net: string }>();

    return {
      income: money(raw?.income ?? 0),
      expense: money(raw?.expense ?? 0),
      net: money(raw?.net ?? 0),
    };
  }

  async setAffectsCash(
    userId: string,
    id: string,
    affectsCash: boolean,
  ): Promise<Transaction> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Transaction);
      const transaction = await repo
        .createQueryBuilder('transaction')
        .setLock('pessimistic_write')
        .where('transaction.id = :id AND transaction.user_id = :userId', { id, userId })
        .getOne();
      if (!transaction) throw new NotFoundException('Transaction not found');

      if (transaction.source === TransactionSource.WAGON) {
        if (!transaction.wagonId) {
          throw new BadRequestException(
            'Bu əməliyyat vaqona aiddir — onu vaqon səhifəsindən dəyişin',
          );
        }
        const wagons = manager.getRepository(Wagon);
        const wagon = await wagons.findOneBy({ id: transaction.wagonId, userId });
        if (!wagon) throw new NotFoundException('Wagon not found');

        if (transaction.wagonSide === WagonSide.BUY) wagon.buyThroughCash = affectsCash;
        else if (transaction.wagonSide === WagonSide.CUSTOMS) {
          wagon.customsThroughCash = affectsCash;
        } else wagon.sellThroughCash = affectsCash;
        await wagons.save(wagon);

        transaction.affectsCash = affectsCash;
        transaction.cashAppliedAmount = affectsCash
          ? this.wagonCashDelta(transaction)
          : null;
        await repo.save(transaction);
        return;
      }

      transaction.affectsCash = affectsCash;
      await this.applyCashEffect(manager, userId, transaction);
      await repo.save(transaction);
    });

    return this.findOne(userId, id);
  }

  private wagonCashDelta(transaction: Transaction): number {
    return transaction.wagonSide === WagonSide.SELL
      ? transaction.amount
      : -transaction.amount;
  }

  async findOne(userId: string, id: string): Promise<Transaction> {
    const transaction = await this.transactionsRepository.findOne({
      where: { id, userId },
      relations: { contact: true, wagon: true },
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
    return transaction;
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateTransactionDto,
  ): Promise<Transaction> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Transaction);
      const transaction = await repo
        .createQueryBuilder('transaction')
        .setLock('pessimistic_write')
        .where('transaction.id = :id AND transaction.user_id = :userId', { id, userId })
        .getOne();
      if (!transaction) throw new NotFoundException('Transaction not found');
      this.assertEditable(transaction);

      await this.reverseBalanceEffect(manager, userId, transaction);

      if (dto.type !== undefined) transaction.type = dto.type;
      if (dto.amount !== undefined) transaction.amount = money(dto.amount);
      if (dto.currency !== undefined) transaction.currency = dto.currency;
      if (dto.date !== undefined) transaction.date = dto.date;
      if (dto.contactId !== undefined) {
        transaction.contactId = dto.contactId;
      } else if (dto.contactName !== undefined) {
        const contact = await this.ledger.findOrCreateByName(
          manager,
          userId,
          dto.contactName,
        );
        transaction.contactId = contact.id;
      }
      if (dto.wagonId !== undefined) {
        if (dto.wagonId) await this.assertWagonOwned(manager, userId, dto.wagonId);
        transaction.wagonId = dto.wagonId;
      }
      if (dto.description !== undefined) transaction.description = dto.description;
      if (dto.affectsBalance !== undefined) {
        transaction.affectsBalance = dto.affectsBalance;
      }
      if (dto.affectsCash !== undefined) {
        transaction.affectsCash = dto.affectsCash;
      }

      await this.applyBalanceEffect(manager, userId, transaction);
      await this.applyCashEffect(manager, userId, transaction);
      await repo.save(transaction);
    });

    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Transaction);
      const transaction = await repo
        .createQueryBuilder('transaction')
        .setLock('pessimistic_write')
        .where('transaction.id = :id AND transaction.user_id = :userId', { id, userId })
        .getOne();
      if (!transaction) throw new NotFoundException('Transaction not found');
      this.assertEditable(transaction);

      await this.reverseBalanceEffect(manager, userId, transaction);
      await repo.delete({ id: transaction.id });
    });
  }

  private assertEditable(transaction: Transaction): void {
    if (transaction.source === TransactionSource.WAGON) {
      throw new BadRequestException(
        'Bu əməliyyat vaqona aiddir — onu vaqon səhifəsindən dəyişin',
      );
    }
  }

  private async applyBalanceEffect(
    manager: EntityManager,
    userId: string,
    transaction: Transaction,
  ): Promise<void> {
    transaction.balanceAppliedAmount = null;
    if (!transaction.contactId) return;

    const contact = await this.ledger.lockContact(manager, userId, transaction.contactId);
    if (!contact) throw new NotFoundException('Contact not found');
    if (transaction.type === TransactionType.OTHER || !transaction.affectsBalance) return;

    const settings = await manager.getRepository(Settings).findOneByOrFail({ userId });
    const primaryAmount = this.ledger.toPrimary(
      transaction.amount,
      transaction.currency,
      settings,
    );
    const delta =
      transaction.type === TransactionType.INCOME ? -primaryAmount : primaryAmount;

    await this.ledger.applyDelta(manager, contact, delta);
    transaction.balanceAppliedAmount = delta;
  }

  private async applyCashEffect(
    manager: EntityManager,
    userId: string,
    transaction: Transaction,
  ): Promise<void> {
    transaction.cashAppliedAmount = null;
    if (!transaction.affectsCash) return;
    if (transaction.type === TransactionType.OTHER) return;

    const settings = await manager.getRepository(Settings).findOneByOrFail({ userId });
    const primaryAmount = this.ledger.toPrimary(
      transaction.amount,
      transaction.currency,
      settings,
    );
    transaction.cashAppliedAmount =
      transaction.type === TransactionType.INCOME ? primaryAmount : -primaryAmount;
  }

  private async reverseBalanceEffect(
    manager: EntityManager,
    userId: string,
    transaction: Transaction,
  ): Promise<void> {
    if (transaction.balanceAppliedAmount === null || !transaction.contactId) return;
    const contact = await this.ledger.lockContact(manager, userId, transaction.contactId);
    if (contact) {
      await this.ledger.applyDelta(manager, contact, -transaction.balanceAppliedAmount);
    }
    transaction.balanceAppliedAmount = null;
  }

  private async assertWagonOwned(
    manager: EntityManager,
    userId: string,
    wagonId: string,
  ): Promise<void> {
    const exists = await manager.getRepository(Wagon).existsBy({ id: wagonId, userId });
    if (!exists) throw new NotFoundException('Wagon not found');
  }
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
