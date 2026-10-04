import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  Currency,
  TransactionSource,
  TransactionType,
  WagonSide,
} from '../../../common/enums';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';
import { Contact } from '../../contacts/entities/contact.entity';
import { User } from '../../users/entities/user.entity';
import { Wagon } from '../../wagons/entities/wagon.entity';

@Entity('transactions')
@Index(['userId', 'date'])
@Index(['userId', 'contactId'])
@Index(['userId', 'wagonId'])
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'enum', enum: TransactionType, enumName: 'transaction_type_enum' })
  type!: TransactionType;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: decimalTransformer,
  })
  amount!: number;

  @Column({ type: 'enum', enum: Currency, enumName: 'currency_enum', default: Currency.DOLLAR })
  currency!: Currency;

  @Column({ type: 'date' })
  date!: string;

  @Column({ name: 'contact_id', type: 'uuid', nullable: true })
  contactId!: string | null;

  @ManyToOne(() => Contact, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'contact_id' })
  contact!: Contact | null;

  @Column({ name: 'wagon_id', type: 'uuid', nullable: true })
  wagonId!: string | null;

  @ManyToOne(() => Wagon, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'wagon_id' })
  wagon!: Wagon | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({
    type: 'enum',
    enum: TransactionSource,
    enumName: 'transaction_source_enum',
    default: TransactionSource.MANUAL,
  })
  source!: TransactionSource;

  @Column({ name: 'affects_balance', type: 'boolean', default: true })
  affectsBalance!: boolean;

  @Column({
    name: 'balance_applied_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  balanceAppliedAmount!: number | null;

  @Column({ name: 'affects_cash', type: 'boolean', default: false })
  affectsCash!: boolean;

  @Column({
    name: 'cash_applied_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  cashAppliedAmount!: number | null;

  @Column({
    name: 'wagon_side',
    type: 'enum',
    enum: WagonSide,
    enumName: 'wagon_side_enum',
    nullable: true,
  })
  wagonSide!: WagonSide | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
