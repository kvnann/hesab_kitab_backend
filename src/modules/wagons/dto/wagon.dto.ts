import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { Currency, WagonStatus } from '../../../common/enums';

export class CreateWagonDto {
  @ApiProperty({ example: 'Vaqon No. 676', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ enum: Currency, default: Currency.DOLLAR })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @ApiPropertyOptional({ enum: WagonStatus, default: WagonStatus.OPEN })
  @IsOptional()
  @IsEnum(WagonStatus)
  status?: WagonStatus;

  // ── Buy side ─────────────────────────────────────────────────
  @ApiPropertyOptional({ example: 205, description: 'Bought volume (m³)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  buyVolume?: number;

  @ApiPropertyOptional({ example: 200, description: 'Buy price per m³' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  buyPrice?: number;

  @ApiPropertyOptional({
    example: 'Kənan',
    description:
      'Contact name the wagon was bought from; auto-created when it does not exist',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  boughtFrom?: string;

  @ApiPropertyOptional({
    default: true,
    description:
      "Whether the purchase affects the contact's balance (owes_us decreases by the buy total)",
  })
  @IsOptional()
  @IsBoolean()
  applyBuyToBalance?: boolean;

  // ── Sell side ────────────────────────────────────────────────
  @ApiPropertyOptional({ example: 200, description: 'Sold volume (m³)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  sellVolume?: number;

  @ApiPropertyOptional({ example: 200, description: 'Sell price per m³' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sellPrice?: number;

  @ApiPropertyOptional({
    example: 'Namiq',
    description:
      'Contact name the wagon was sold to; auto-created when it does not exist',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  soldTo?: string;

  @ApiPropertyOptional({
    default: true,
    description:
      "Whether the sale affects the contact's balance (owes_us increases by the sell total)",
  })
  @IsOptional()
  @IsBoolean()
  applySellToBalance?: boolean;

  @ApiPropertyOptional({ example: '5 m³ yolda itki, sənədlə təsdiqlənib' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

/**
 * All fields optional; explicit null clears:
 *  - buyVolume/buyPrice: null → removes the whole buy side (same for sell)
 *  - boughtFrom/soldTo: null → unlinks the contact (reversing any applied balance)
 */
export class UpdateWagonDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ enum: Currency })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @ApiPropertyOptional({ enum: WagonStatus })
  @IsOptional()
  @IsEnum(WagonStatus)
  status?: WagonStatus;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  buyVolume?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  buyPrice?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  boughtFrom?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  applyBuyToBalance?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  sellVolume?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sellPrice?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  soldTo?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  applySellToBalance?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsString()
  @MaxLength(1000)
  description?: string | null;
}

export class ListWagonsDto {
  @ApiPropertyOptional({ enum: WagonStatus })
  @IsOptional()
  @IsEnum(WagonStatus)
  status?: WagonStatus;
}
