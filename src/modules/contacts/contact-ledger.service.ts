import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Currency } from '../../common/enums';
import { add, convert, money } from '../../common/utils/decimal.util';
import { Settings } from '../settings/entities/settings.entity';
import { Contact } from './entities/contact.entity';

/**
 * All owes_us mutations go through this service, inside a caller-provided
 * database transaction, with the contact row locked (SELECT ... FOR UPDATE)
 * so concurrent wagon/transaction writes cannot lose updates.
 *
 * Sign convention: owes_us > 0 → the contact owes us; owes_us < 0 → we owe.
 */
@Injectable()
export class ContactLedgerService {
  /** Lock and return a contact owned by the user, or null if absent. */
  async lockContact(
    manager: EntityManager,
    userId: string,
    contactId: string,
  ): Promise<Contact | null> {
    return manager
      .getRepository(Contact)
      .createQueryBuilder('contact')
      .setLock('pessimistic_write')
      .where('contact.id = :contactId', { contactId })
      .andWhere('contact.user_id = :userId', { userId })
      .getOne();
  }

  /** Find a contact by case-insensitive name (locked), creating it if missing. */
  async findOrCreateByName(
    manager: EntityManager,
    userId: string,
    name: string,
  ): Promise<Contact> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new BadRequestException('Contact name must not be blank');
    }
    const repo = manager.getRepository(Contact);
    const existing = await repo
      .createQueryBuilder('contact')
      .setLock('pessimistic_write')
      .where('contact.user_id = :userId', { userId })
      .andWhere('lower(contact.name) = lower(:name)', { name: trimmed })
      .getOne();
    if (existing) return existing;

    return repo.save(repo.create({ userId, name: trimmed, owesUs: 0 }));
  }

  /** Apply a signed delta to a locked contact's balance. */
  async applyDelta(
    manager: EntityManager,
    contact: Contact,
    delta: number,
  ): Promise<void> {
    if (delta === 0) return;
    contact.owesUs = add(contact.owesUs, delta);
    await manager.getRepository(Contact).save(contact);
  }

  /**
   * Convert an amount into the user's primary currency using their manual
   * exchange rate (secondary units per 1 primary unit).
   */
  toPrimary(amount: number, currency: Currency, settings: Settings): number {
    if ((currency as string) === (settings.primaryCurrency as string)) {
      return money(amount);
    }
    if ((currency as string) === (settings.secondaryCurrency as string)) {
      return convert(amount, settings.exchangeRate, 'toPrimary');
    }
    throw new BadRequestException(
      `No exchange rate configured between '${currency}' and your primary currency ` +
        `'${settings.primaryCurrency}'. Update your settings first.`,
    );
  }
}
