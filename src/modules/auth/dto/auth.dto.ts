import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SignupDto {
  @ApiProperty({ example: 'zulfali', minLength: 3, maxLength: 50 })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: 'username may only contain letters, digits, dots, underscores and dashes',
  })
  username!: string;

  @ApiProperty({ example: 'S3cure-password!', minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ example: 'Zülfəli Abdullayev', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fullName!: string;

  @ApiPropertyOptional({ example: 'Personal account' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'zulfali' })
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiProperty({ example: 'S3cure-password!' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'The opaque refresh token issued at login/signup/refresh' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
