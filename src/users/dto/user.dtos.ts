import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ format: 'email', maxLength: 320 })
  @IsEmail({}, { message: 'Email is not valid.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @ApiProperty({ minLength: 3, maxLength: 64 })
  @IsString()
  @Matches(/^[a-z0-9_.-]{3,64}$/, {
    message: 'Username must be 3-64 chars: a-z, 0-9, dot, dash, underscore.',
  })
  username!: string;

  @ApiProperty({ minLength: 1, maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  displayName!: string;

  @ApiProperty({ minLength: 10, maxLength: 72 })
  @IsString()
  @MinLength(10, { message: 'Password must be at least 10 characters.' })
  @MaxLength(72, { message: 'Password must be at most 72 characters.' })
  password!: string;

  @ApiPropertyOptional({ type: [String], example: ['intern'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  roleCodes?: string[];
}

export class UpdateUserDto {
  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  displayName?: string;

  @ApiPropertyOptional({ minLength: 3, maxLength: 64 })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_.-]{3,64}$/, {
    message: 'Username must be 3-64 chars: a-z, 0-9, dot, dash, underscore.',
  })
  username?: string;
}

export class SetUserStatusDto {
  @ApiProperty({ enum: ['active', 'pending', 'locked', 'deleted'] })
  @IsIn(['active', 'pending', 'locked', 'deleted'])
  status!: 'active' | 'pending' | 'locked' | 'deleted';
}
