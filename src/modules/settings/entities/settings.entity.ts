import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Currency, SecondaryCurrency } from '../../../common/enums';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';
import { User } from '../../users/entities/user.entity';

@Entity('settings')
export class Settings {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({
    name: 'primary_currency',
    type: 'enum',
    enum: Currency,
    enumName: 'currency_enum',
    default: Currency.DOLLAR,
  })
  primaryCurrency!: Currency;

  @Column({
    name: 'secondary_currency',
    type: 'enum',
    enum: SecondaryCurrency,
    enumName: 'secondary_currency_enum',
    default: SecondaryCurrency.MANAT,
  })
  secondaryCurrency!: SecondaryCurrency;

  /** Manual rate: secondary units per 1 primary unit (e.g. 1 USD = 1.70 AZN). */
  @Column({
    name: 'exchange_rate',
    type: 'numeric',
    precision: 12,
    scale: 4,
    default: 1.7,
    transformer: decimalTransformer,
  })
  exchangeRate!: number;

  @Column({ name: 'last_changed_date', type: 'timestamptz', default: () => 'now()' })
  lastChangedDate!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
