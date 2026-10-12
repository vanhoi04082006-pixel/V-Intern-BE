import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsObject, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class DraftSprintPlanDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  projectId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  sessionId!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 8 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  sprintCount?: number;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  startDate?: string;
}

export class ConfirmSprintPlanDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  projectId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  sessionId!: string;

  @ApiProperty({ description: 'Instructor-reviewed draft (re-validated server-side)' })
  @IsObject()
  draft!: Record<string, unknown>;

  @ApiProperty({ format: 'uuid', description: 'Client-generated idempotency key' })
  @IsUUID('4')
  requestId!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Stored plan being confirmed (marked confirmed on success)' })
  @IsOptional()
  @IsUUID('4')
  planId?: string;
}

export class GeneratePlanDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  projectId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  sessionId!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 8 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  sprintCount?: number;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Client idempotency key: replays return the stored plan' })
  @IsOptional()
  @IsUUID('4')
  requestId?: string;
}

export class PlanSessionQueryDto {
  @ApiProperty({ format: 'uuid', description: 'List plans of one session' })
  @IsUUID('4')
  sessionId!: string;
}
