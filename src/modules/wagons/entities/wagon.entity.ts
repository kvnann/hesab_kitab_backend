import { Expose } from 'class-transformer';
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
  CustomsPayer,
  Currency,
  WagonLocation,
  WagonStatus,
} from '../../../common/enums';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';
import { sub, total } from '../../../common/utils/decimal.util';
import { Contact } from '../../contacts/entities/contact.entity';
import { User } from '../../users/entities/user.entity';

@Entity('wagons')
@Index(['userId', 'status'])
export class Wagon {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ length: 100 })
  name!: string;

  @Column({ type: 'enum', enum: Currency, enumName: 'currency_enum', default: Currency.DOLLAR })
  currency!: Currency;

  @Column({
    type: 'enum',
    enum: WagonStatus,
    enumName: 'wagon_status_enum',
    default: WagonStatus.OPEN,
  })
  status!: WagonStatus;

  /** Where the goods are right now; unrelated to the archive flag above. */
  @Column({
    type: 'enum',
    enum: WagonLocation,
    enumName: 'wagon_location_enum',
    default: WagonLocation.RUSSIA,
  })
  location!: WagonLocation;

  // ── Buy side ─────────────────────────────────────────────────
  @Column({
    name: 'buy_volume',
    type: 'numeric',
    precision: 12,
    scale: 3,
    nullable: true,
    transformer: decimalTransformer,
  })
  buyVolume!: number | null;

  @Column({
    name: 'buy_price',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  buyPrice!: number | null;

  @Index()
  @Column({ name: 'bought_from_contact_id', type: 'uuid', nullable: true })
  boughtFromContactId!: string | null;

  @ManyToOne(() => Contact, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'bought_from_contact_id' })
  boughtFrom!: Contact | null;

  /**
   * Signed delta actually applied to the bought-from contact's owes_us when
   * the buy side was recorded (in the user's primary currency). Stored so the
   * effect can be reversed exactly on edit/delete.
   */
  @Column({
    name: 'buy_applied_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  buyAppliedAmount!: number | null;

  // ── Sell side ────────────────────────────────────────────────
  @Column({
    name: 'sell_volume',
    type: 'numeric',
    precision: 12,
    scale: 3,
    nullable: true,
    transformer: decimalTransformer,
  })
  sellVolume!: number | null;

  @Column({
    name: 'sell_price',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  sellPrice!: number | null;

  @Index()
  @Column({ name: 'sold_to_contact_id', type: 'uuid', nullable: true })
  soldToContactId!: string | null;

  @ManyToOne(() => Contact, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'sold_to_contact_id' })
  soldTo!: Contact | null;

  @Column({
    name: 'sell_applied_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  sellAppliedAmount!: number | null;

  /** Whether the purchase was paid out of the till. */
  @Column({ name: 'buy_through_cash', type: 'boolean', default: false })
  buyThroughCash!: boolean;

  /** Whether the sale proceeds were taken into the till. */
  @Column({ name: 'sell_through_cash', type: 'boolean', default: false })
  sellThroughCash!: boolean;

  // ── Customs ("Gömrük xərci") ─────────────────────────────────
  /** Optional cost one of the counterparties carries; null or 0 means none. */
  @Column({
    name: 'customs_expense',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  customsExpense!: number | null;

  @Column({
    name: 'customs_payer',
    type: 'enum',
    enum: CustomsPayer,
    enumName: 'customs_payer_enum',
    nullable: true,
  })
  customsPayer!: CustomsPayer | null;

  /** Signed delta applied to the payer's owes_us, for exact reversal. */
  @Column({
    name: 'customs_applied_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  customsAppliedAmount!: number | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  // ── Computed fields (serialized in API responses) ────────────
  @Expose()
  get buyTotal(): number | null {
    return this.buyVolume !== null && this.buyPrice !== null
      ? total(this.buyVolume, this.buyPrice)
      : null;
  }

  @Expose()
  get sellTotal(): number | null {
    return this.sellVolume !== null && this.sellPrice !== null
      ? total(this.sellVolume, this.sellPrice)
      : null;
  }

  /**
   * The deal's margin ("Fərq"): sellTotal − buyTotal − customs. Customs is a
   * real cost of moving the goods, so it comes off the margin whichever
   * counterparty is billed for it. Null unless both sides exist.
   */
  @Expose()
  get difference(): number | null {
    const buy = this.buyTotal;
    const sell = this.sellTotal;
    if (buy === null || sell === null) return null;
    return sub(sub(sell, buy), this.customsExpense ?? 0);
  }
}
