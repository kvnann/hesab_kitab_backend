import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Currency } from '../../common/enums';
import { add, convert, money } from '../../common/utils/decimal.util';
import { Settings } from '../settings/entities/settings.entity';
import { Contact } from './entities/contact.entity';

@Injectable()
export class ContactLedgerService {
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

  async applyDelta(
    manager: EntityManager,
    contact: Contact,
    delta: number,
  ): Promise<void> {
    if (delta === 0) return;
    contact.owesUs = add(contact.owesUs, delta);
    await manager.getRepository(Contact).save(contact);
  }

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
