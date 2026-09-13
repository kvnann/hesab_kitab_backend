import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { OwingDirection } from '../../../common/enums';

export class CreateContactDto {
  @ApiProperty({ example: 'Şamil Əliyev', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: '+994 50 123 45 67' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Matches(/^[+\d][\d\s\-()]*$/, { message: 'phone must be a valid phone number' })
  phone?: string;

  @ApiPropertyOptional({
    enum: OwingDirection,
    default: OwingDirection.OWES_US,
    description: 'Direction of the initial balance',
  })
  @IsOptional()
  @IsEnum(OwingDirection)
  direction?: OwingDirection;

  @ApiPropertyOptional({
    example: 2200,
    minimum: 0,
    default: 0,
    description: 'Unsigned initial balance; sign is derived from direction',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  initialBalance?: number;

  @ApiPropertyOptional({ example: 'Vaqon 674 üçün avans' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class UpdateContactDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsString()
  @MaxLength(30)
  @Matches(/^[+\d][\d\s\-()]*$/, { message: 'phone must be a valid phone number' })
  phone?: string | null;

  @ApiPropertyOptional({
    description: 'Directly set the signed balance (positive: contact owes us)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  owesUs?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsString()
  @MaxLength(1000)
  description?: string | null;
}
