import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { Currency, TransactionType } from '../../../common/enums';

const DATE_ONLY = { strict: true } as const;

export class CreateTransactionDto {
  @ApiProperty({ enum: TransactionType })
  @IsEnum(TransactionType)
  type!: TransactionType;

  @ApiProperty({ example: 2000, description: 'Positive amount' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @ApiPropertyOptional({ enum: Currency, default: Currency.DOLLAR })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @ApiProperty({ example: '2026-07-27', description: 'Calendar date (YYYY-MM-DD)' })
  @IsISO8601(DATE_ONLY)
  date!: string;

  @ApiPropertyOptional({ description: 'Related contact; income/expense update its balance' })
  @IsOptional()
  @IsUUID()
  contactId?: string;

  @ApiPropertyOptional({
    description:
      'Alternative to contactId: contact name, auto-created when it does not exist',
    example: 'Kənan',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  contactName?: string;

  @ApiPropertyOptional({ description: 'Related wagon' })
  @IsOptional()
  @IsUUID()
  wagonId?: string;

  @ApiPropertyOptional({ example: 'Vaqon 676 üzrə ilkin ödəniş' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    default: true,
    description:
      "false for 'other' income/expense: counted in summaries but the contact's balance is untouched",
  })
  @IsOptional()
  @IsBoolean()
  affectsBalance?: boolean;
}

/** Explicit null on contactId/wagonId/description clears the field. */
export class UpdateTransactionDto {
  @ApiPropertyOptional({ enum: TransactionType })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount?: number;

  @ApiPropertyOptional({ enum: Currency })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @ApiPropertyOptional({ example: '2026-07-27' })
  @IsOptional()
  @IsISO8601(DATE_ONLY)
  date?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsUUID()
  contactId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsUUID()
  wagonId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  affectsBalance?: boolean;
}

export class ListTransactionsDto extends PaginationDto {
  @ApiPropertyOptional({ example: '2026-07-01', description: 'Start date (inclusive)' })
  @IsOptional()
  @IsISO8601(DATE_ONLY)
  from?: string;

  @ApiPropertyOptional({ example: '2026-07-31', description: 'End date (inclusive)' })
  @IsOptional()
  @IsISO8601(DATE_ONLY)
  to?: string;

  @ApiPropertyOptional({ example: '2026-07-27', description: 'Exact date' })
  @IsOptional()
  @IsISO8601(DATE_ONLY)
  date?: string;

  @ApiPropertyOptional({ enum: TransactionType })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  contactId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  wagonId?: string;
}

export class MonthSummaryDto {
  @ApiProperty({ example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @ApiProperty({ example: 7, minimum: 1, maximum: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;
}
