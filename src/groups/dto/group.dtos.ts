import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsUUID, ArrayMaxSize, ArrayUnique, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateGroupDto {
  @ApiProperty({ maxLength: 64 })
  @IsString()
  @Matches(/^[a-z0-9_.-]{3,64}$/, { message: 'Code must be 3-64 chars: a-z, 0-9, dot, dash, underscore.' })
  code!: string;

  @ApiProperty({ minLength: 1, maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;

  @ApiPropertyOptional({ maxLength: 512 })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;
}

export class UpdateGroupDto {
  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name?: string;

  @ApiPropertyOptional({ maxLength: 512 })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;
}

export class AddGroupMembersDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  userIds!: string[];
}

export class SetGroupRolesDto {
  @ApiProperty({ type: [String], example: ['instructor'] })
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsString({ each: true })
  roleCodes!: string[];
}
