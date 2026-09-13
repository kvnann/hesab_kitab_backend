import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsPositive } from 'class-validator';
import { Currency, SecondaryCurrency } from '../../../common/enums';

export class UpdateSettingsDto {
  @ApiPropertyOptional({ enum: Currency })
  @IsOptional()
  @IsEnum(Currency)
  primaryCurrency?: Currency;

  @ApiPropertyOptional({ enum: SecondaryCurrency })
  @IsOptional()
  @IsEnum(SecondaryCurrency)
  secondaryCurrency?: SecondaryCurrency;

  @ApiPropertyOptional({
    example: 1.7,
    description: 'Secondary currency units per 1 primary unit (e.g. 1 USD = 1.70 AZN)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  exchangeRate?: number;
}
