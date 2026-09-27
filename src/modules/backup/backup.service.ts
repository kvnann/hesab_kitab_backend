import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Contact } from '../contacts/entities/contact.entity';
import { Settings } from '../settings/entities/settings.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { User } from '../users/entities/user.entity';
import { Wagon } from '../wagons/entities/wagon.entity';

/**
 * Everything one user owns, in one JSON document. Relations are kept as plain
 * ids (contactId / wagonId) rather than nested objects so the file is a faithful
 * copy of the rows and could be read back later, with `contacts` available to
 * resolve those ids into names.
 */
export interface BackupFile {
  format: 'hesab-kitab-backup';
  version: number;
  exportedAt: string;
  user: { username: string; fullName: string; note: string | null };
  settings: {
    primaryCurrency: string;
    secondaryCurrency: string;
    exchangeRate: number;
  } | null;
  contacts: Contact[];
  wagons: Wagon[];
  transactions: Transaction[];
  counts: { contacts: number; wagons: number; transactions: number };
}

@Injectable()
export class BackupService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Credentials are deliberately absent: no password hash, no refresh tokens.
   * Contact phone numbers are stored encrypted but come back decrypted here,
   * because a backup nobody can read is not a backup.
   */
  async export(userId: string): Promise<BackupFile> {
    const user = await this.dataSource.getRepository(User).findOneBy({ id: userId });
    if (!user) throw new NotFoundException('User not found');

    const [settings, contacts, wagons, transactions] = await Promise.all([
      this.dataSource.getRepository(Settings).findOneBy({ userId }),
      this.dataSource.getRepository(Contact).find({
        where: { userId },
        order: { name: 'ASC' },
      }),
      this.dataSource.getRepository(Wagon).find({
        where: { userId },
        order: { createdAt: 'ASC' },
      }),
      this.dataSource.getRepository(Transaction).find({
        where: { userId },
        order: { date: 'ASC', createdAt: 'ASC' },
      }),
    ]);

    return {
      format: 'hesab-kitab-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      user: { username: user.username, fullName: user.fullName, note: user.note },
      settings: settings
        ? {
            primaryCurrency: settings.primaryCurrency,
            secondaryCurrency: settings.secondaryCurrency,
            exchangeRate: settings.exchangeRate,
          }
        : null,
      contacts,
      wagons,
      transactions,
      counts: {
        contacts: contacts.length,
        wagons: wagons.length,
        transactions: transactions.length,
      },
    };
  }
}
