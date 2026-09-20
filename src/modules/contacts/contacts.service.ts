import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OwingDirection } from '../../common/enums';
import { money } from '../../common/utils/decimal.util';
import { Transaction } from '../transactions/entities/transaction.entity';
import { Wagon } from '../wagons/entities/wagon.entity';
import { CreateContactDto, UpdateContactDto } from './dto/contact.dto';
import { Contact } from './entities/contact.entity';

export interface ContactsSummary {
  /** Sum of positive balances — what contacts owe us. */
  receivable: number;
  /** Sum of negative balances (as a negative number) — what we owe. */
  payable: number;
  net: number;
  count: number;
}

@Injectable()
export class ContactsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Contact)
    private readonly contactsRepository: Repository<Contact>,
  ) {}

  async create(userId: string, dto: CreateContactDto): Promise<Contact> {
    const direction = dto.direction ?? OwingDirection.OWES_US;
    const balance = money(dto.initialBalance ?? 0);
    const owesUs = direction === OwingDirection.OWES_US ? balance : -balance;

    return this.contactsRepository.save(
      this.contactsRepository.create({
        userId,
        name: this.requireName(dto.name),
        phone: dto.phone ?? null,
        owesUs,
        description: dto.description ?? null,
      }),
    );
  }

  async findAll(userId: string): Promise<Contact[]> {
    return this.contactsRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async summary(userId: string): Promise<ContactsSummary> {
    const raw = await this.contactsRepository
      .createQueryBuilder('contact')
      .select(
        'COALESCE(SUM(contact.owes_us) FILTER (WHERE contact.owes_us > 0), 0)',
        'receivable',
      )
      .addSelect(
        'COALESCE(SUM(contact.owes_us) FILTER (WHERE contact.owes_us < 0), 0)',
        'payable',
      )
      .addSelect('COUNT(*)', 'count')
      .where('contact.user_id = :userId', { userId })
      .getRawOne<{ receivable: string; payable: string; count: string }>();

    const receivable = money(raw?.receivable ?? 0);
    const payable = money(raw?.payable ?? 0);
    return {
      receivable,
      payable,
      net: money(receivable + payable),
      count: parseInt(raw?.count ?? '0', 10),
    };
  }

  async findOne(userId: string, id: string): Promise<Contact> {
    const contact = await this.contactsRepository.findOneBy({ id, userId });
    if (!contact) throw new NotFoundException('Contact not found');
    return contact;
  }

  async update(userId: string, id: string, dto: UpdateContactDto): Promise<Contact> {
    const contact = await this.findOne(userId, id);
    if (dto.name !== undefined) contact.name = this.requireName(dto.name);
    if (dto.phone !== undefined) contact.phone = dto.phone;
    if (dto.owesUs !== undefined) contact.owesUs = money(dto.owesUs);
    if (dto.description !== undefined) contact.description = dto.description;
    return this.contactsRepository.save(contact);
  }

  private requireName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('Contact name must not be blank');
    return trimmed;
  }

  /**
   * Deleting a contact takes their transactions with it — the app warns the
   * user of exactly that. Wagons survive: their contact columns are
   * ON DELETE SET NULL, so a wagon side simply loses its counterparty name.
   * The applied amounts stay on the wagon but are never reversed again,
   * because the balance they belonged to no longer exists.
   */
  async remove(userId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const exists = await manager.getRepository(Contact).existsBy({ id, userId });
      if (!exists) throw new NotFoundException('Contact not found');

      await manager.getRepository(Transaction).delete({ userId, contactId: id });
      // Clear the applied amounts on the sides about to be unlinked, so a later
      // wagon edit cannot try to reverse a delta against a deleted contact.
      const wagons = manager.getRepository(Wagon);
      await wagons.update({ userId, boughtFromContactId: id }, { buyAppliedAmount: null });
      await wagons.update({ userId, soldToContactId: id }, { sellAppliedAmount: null });

      await manager.getRepository(Contact).delete({ id, userId });
    });
  }
}
