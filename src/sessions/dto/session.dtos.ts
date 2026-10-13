import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { MILESTONE_STATUSES } from '../entities/session-milestone.entity';
import { SESSION_STATUSES } from '../entities/internship-session.entity';

const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export class CreateSessionDto {
  @ApiProperty({ minLength: 1, maxLength: 64, example: 'SUMMER-2026' })
  @IsString()
  @Length(1, 64)
  @Matches(CODE_PATTERN, { message: 'code must match /^[A-Za-z0-9][A-Za-z0-9._-]*$/' })
  code!: string;

  @ApiProperty({ minLength: 1, maxLength: 256 })
  @IsString()
  @Length(1, 256)
  name!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: SESSION_STATUSES })
  @IsOptional()
  @IsIn(SESSION_STATUSES as unknown as string[])
  status?: (typeof SESSION_STATUSES)[number];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  leadInstructorId?: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  startDate!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  endDate!: string;
}

export class UpdateSessionDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 256 })
  @IsOptional()
  @IsString()
  @Length(1, 256)
  name?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** Status changes go through the explicit transition machine (409 otherwise). */
  @ApiPropertyOptional({ enum: SESSION_STATUSES })
  @IsOptional()
  @IsIn(SESSION_STATUSES as unknown as string[])
  status?: (typeof SESSION_STATUSES)[number];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  leadInstructorId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  endDate?: string;
}

export class AddSessionMembersDto {
  @ApiProperty({ type: [String], format: 'uuid', minItems: 1, maxItems: 200 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  userIds!: string[];
}

export class AddSessionInstructorsDto {
  @ApiProperty({ type: [String], format: 'uuid', minItems: 1, maxItems: 100 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  instructorIds!: string[];
}

export class CreateMilestoneDto {
  @ApiProperty({ minLength: 1, maxLength: 256 })
  @IsString()
  @Length(1, 256)
  title!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @ApiPropertyOptional({ enum: MILESTONE_STATUSES })
  @IsOptional()
  @IsIn(MILESTONE_STATUSES as unknown as string[])
  status?: (typeof MILESTONE_STATUSES)[number];

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  sortOrder?: number;
}

export class UpdateMilestoneDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 256 })
  @IsOptional()
  @IsString()
  @Length(1, 256)
  title?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @ApiPropertyOptional({ enum: MILESTONE_STATUSES })
  @IsOptional()
  @IsIn(MILESTONE_STATUSES as unknown as string[])
  status?: (typeof MILESTONE_STATUSES)[number];

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  sortOrder?: number;
}

export class QuerySessionsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID('4')
  projectId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID('4')
  leadInstructorId?: string;
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: SESSION_STATUSES })
  @IsOptional()
  @IsIn(SESSION_STATUSES as unknown as string[])
  status?: (typeof SESSION_STATUSES)[number];
}

export class QueryInstructorOptionsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class QueryMemberOptionsDto extends QueryInstructorOptionsDto {
  @IsOptional() @IsUUID('4') sessionId?: string;
  @IsOptional() @IsUUID('4') projectId?: string;
}
