import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
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
import { PROJECT_DIFFICULTIES, PROJECT_STATUSES } from '../entities/project.entity';

const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export class CreateProjectDto {
  @ApiProperty({ minLength: 1, maxLength: 64, example: 'PRJ-ECOM-001' })
  @IsString()
  @Length(1, 64)
  @Matches(CODE_PATTERN, { message: 'code must match /^[A-Za-z0-9][A-Za-z0-9._-]*$/' })
  code!: string;

  @ApiProperty({ minLength: 1, maxLength: 256 })
  @IsString()
  @Length(1, 256)
  name!: string;

  @ApiProperty({ minLength: 1, maxLength: 4000 })
  @IsString()
  @Length(1, 4000)
  description!: string;

  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  domainCategory?: string;

  @ApiPropertyOptional({ enum: PROJECT_DIFFICULTIES })
  @IsOptional()
  @IsIn(PROJECT_DIFFICULTIES as unknown as string[])
  difficulty?: (typeof PROJECT_DIFFICULTIES)[number];

  @ApiPropertyOptional({ enum: PROJECT_STATUSES })
  @IsOptional()
  @IsIn(PROJECT_STATUSES as unknown as string[])
  status?: (typeof PROJECT_STATUSES)[number];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  mentorId?: string;

  @ApiPropertyOptional({ minimum: 1, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  capacity?: number;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 50 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Length(1, 64, { each: true })
  technologies?: string[];
}

export class UpdateProjectDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 256 })
  @IsOptional()
  @IsString()
  @Length(1, 256)
  name?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 4000 })
  @IsOptional()
  @IsString()
  @Length(1, 4000)
  description?: string;

  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  domainCategory?: string;

  @ApiPropertyOptional({ enum: PROJECT_DIFFICULTIES })
  @IsOptional()
  @IsIn(PROJECT_DIFFICULTIES as unknown as string[])
  difficulty?: (typeof PROJECT_DIFFICULTIES)[number];

  @ApiPropertyOptional({ enum: PROJECT_STATUSES })
  @IsOptional()
  @IsIn(PROJECT_STATUSES as unknown as string[])
  status?: (typeof PROJECT_STATUSES)[number];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  mentorId?: string;

  @ApiPropertyOptional({ minimum: 1, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  capacity?: number;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 50 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Length(1, 64, { each: true })
  technologies?: string[];
}

/** Sort is a strict whitelist (spec 36) — no client-controlled SQL surface. */
export class QueryProjectsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: PROJECT_STATUSES })
  @IsOptional()
  @IsIn(PROJECT_STATUSES as unknown as string[])
  status?: (typeof PROJECT_STATUSES)[number];

  @ApiPropertyOptional({ enum: PROJECT_DIFFICULTIES })
  @IsOptional()
  @IsIn(PROJECT_DIFFICULTIES as unknown as string[])
  difficulty?: (typeof PROJECT_DIFFICULTIES)[number];

  @ApiPropertyOptional({ enum: ['createdAt', 'code', 'name'] })
  @IsOptional()
  @IsIn(['createdAt', 'code', 'name'])
  sort?: 'createdAt' | 'code' | 'name';

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  order?: 'ASC' | 'DESC';
}
