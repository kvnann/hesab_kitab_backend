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
import {
  CustomsPayer,
  Currency,
  WagonLocation,
  WagonStatus,
} from '../../../common/enums';

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

  @ApiPropertyOptional({
    enum: WagonLocation,
    default: WagonLocation.RUSSIA,
    description: 'Where the goods are; wagons start in Russia',
  })
  @IsOptional()
  @IsEnum(WagonLocation)
  location?: WagonLocation;

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

  @ApiPropertyOptional({
    default: false,
    description: 'true when the purchase was paid out of the till (Kassa)',
  })
  @IsOptional()
  @IsBoolean()
  buyThroughCash?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: 'true when the sale proceeds were taken into the till (Kassa)',
  })
  @IsOptional()
  @IsBoolean()
  sellThroughCash?: boolean;

  @ApiPropertyOptional({
    example: 500,
    minimum: 0,
    description: 'Gömrük xərci; 0 or omitted means none',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  customsExpense?: number;

  @ApiPropertyOptional({
    enum: CustomsPayer,
    description:
      "Who carries the customs cost. Required once customsExpense is above 0; " +
      "'buyer' bills the sold-to contact, 'seller' the bought-from contact",
  })
  @IsOptional()
  @IsEnum(CustomsPayer)
  customsPayer?: CustomsPayer;

  @ApiPropertyOptional({ example: '5 m³ yolda itki, sənədlə təsdiqlənib' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

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

  @ApiPropertyOptional({ enum: WagonLocation, description: 'Any point to any point' })
  @IsOptional()
  @IsEnum(WagonLocation)
  location?: WagonLocation;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  buyThroughCash?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  sellThroughCash?: boolean;

  @ApiPropertyOptional({ nullable: true, description: 'null or 0 clears the customs cost' })
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  customsExpense?: number | null;

  @ApiPropertyOptional({ enum: CustomsPayer, nullable: true })
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsEnum(CustomsPayer)
  customsPayer?: CustomsPayer | null;

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

  @ApiPropertyOptional({ enum: WagonLocation, description: 'Any point to any point' })
  @IsOptional()
  @IsEnum(WagonLocation)
  location?: WagonLocation;
}
