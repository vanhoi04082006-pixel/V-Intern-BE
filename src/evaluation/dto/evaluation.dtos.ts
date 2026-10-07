import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { EVALUATION_CYCLE_STATUSES, EVALUATION_CYCLE_TYPES } from '../evaluation-status.machine';
import { EVALUATION_TEMPLATE_V1 } from '../evaluation-template';

export class CreateEvaluationCycleDto {
  @ApiProperty({ maxLength: 64, example: 'SPRINT-1-EVAL-2026' })
  @IsString()
  @Length(1, 64)
  code!: string;

  @ApiProperty({ maxLength: 256 })
  @IsString()
  @Length(1, 256)
  name!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  sessionId?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @ApiProperty({ enum: EVALUATION_CYCLE_TYPES, default: 'sprint' })
  @IsIn(EVALUATION_CYCLE_TYPES as unknown as string[])
  type!: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  endDate!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @ApiPropertyOptional({
    description: 'Seed the documented evaluation-v1 template criteria (default true)',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  useDefaultTemplate?: boolean;
}

export class UpdateEvaluationCycleDto {
  @ApiPropertyOptional({ maxLength: 256 })
  @IsOptional()
  @IsString()
  @Length(1, 256)
  name?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;
}

export class ChangeEvaluationCycleStatusDto {
  @ApiProperty({ enum: EVALUATION_CYCLE_STATUSES })
  @IsIn(EVALUATION_CYCLE_STATUSES as unknown as string[])
  status!: string;
}

export class CreateEvaluationCriterionDto {
  @ApiProperty({ maxLength: 64, example: 'technical_quality' })
  @IsString()
  @Length(1, 64)
  code!: string;

  @ApiProperty({ maxLength: 128 })
  @IsString()
  @Length(1, 128)
  name!: string;

  @ApiPropertyOptional({ maxLength: 512 })
  @IsOptional()
  @IsString()
  @Length(0, 512)
  description?: string | null;

  @ApiProperty({ description: 'Percentage weight (2dp); active criteria must total exactly 100', minimum: 0.01, maximum: 100 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100)
  weight!: number;

  @ApiPropertyOptional({ default: 100, minimum: 0.1, maximum: 100 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0.1)
  @Max(100)
  maxScore?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;
}

export class UpdateEvaluationCriterionDto extends PartialType(CreateEvaluationCriterionDto) {}

export class CreateEvaluationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  cycleId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  internId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Defaults to the authenticated evaluator; instructors can only self-assign',
  })
  @IsOptional()
  @IsUUID()
  evaluatorId?: string;
}

export class EvaluationScoreInputDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  criterionId!: string;

  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(100)
  score!: number;

  @ApiPropertyOptional({ maxLength: 1024 })
  @IsOptional()
  @IsString()
  @Length(0, 1024)
  comment?: string | null;
}

export class UpdateEvaluationDto {
  @ApiProperty({ type: [EvaluationScoreInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EvaluationScoreInputDto)
  scores!: EvaluationScoreInputDto[];

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @IsString()
  @Length(0, 4000)
  summary?: string | null;
}

export class ReviseEvaluationDto {
  @ApiPropertyOptional({ type: [EvaluationScoreInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EvaluationScoreInputDto)
  scores?: EvaluationScoreInputDto[];

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @IsString()
  @Length(0, 4000)
  summary?: string;

  @ApiProperty({ maxLength: 1000, description: 'Required audit reason for the privileged correction' })
  @IsString()
  @Length(1, 1000)
  reason!: string;
}

/** Exposed for documentation: the V1 template ships exactly these criteria. */
export const EVALUATION_V1_TEMPLATE_CRITERIA = EVALUATION_TEMPLATE_V1.criteria;
