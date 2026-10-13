import { ApiProperty, ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsISO8601,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { SPRINT_STATUSES, SprintStatus } from '../sprint-status.machine';

export class CreateSprintDto {
  @ApiProperty({ description: 'Unique sprint code (UX_sprints_code)', maxLength: 64, example: 'SP-VIN-01' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 64)
  code!: string;

  @ApiProperty({ maxLength: 256 })
  @IsString()
  @IsNotEmpty()
  @Length(1, 256)
  name!: string;

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiProperty({ format: 'uuid', description: 'Sprint belongs to exactly ONE project' })
  @IsUUID('4')
  projectId!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Optional internship-session link' })
  @IsOptional()
  @IsUUID('4')
  sessionId?: string;

  @ApiPropertyOptional({ maxLength: 512, description: 'Sprint goal (activation notifies the project interns)' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  goal?: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  startDate!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  endDate!: string;
}

/** Metadata-only update (spec 19). Status changes go through POST /:id/status. */
export class UpdateSprintDto extends PickType(PartialType(CreateSprintDto), [
  'name',
  'description',
  'goal',
  'startDate',
  'endDate',
] as const) {}

export class TransitionSprintDto {
  @ApiProperty({ enum: SPRINT_STATUSES, description: 'Target status (legal transitions enforced server-side)' })
  @IsIn(SPRINT_STATUSES as unknown as string[])
  status!: SprintStatus;

  @ApiPropertyOptional({
    default: false,
    description:
      'Explicit override for the open-tasks completion policy: complete even when open tasks remain (409 SPRINT_HAS_OPEN_TASKS otherwise). The override is audited.',
  })
  @IsOptional()
  @IsBoolean()
  allowOpenTasks?: boolean;
}

export class QuerySprintsDto extends PaginationQueryDto {
  @IsOptional() @IsUUID('4') assigneeId?: string;
  @IsOptional() @IsISO8601() dueFrom?: string;
  @IsOptional() @IsISO8601() dueTo?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  projectId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  sessionId?: string;

  @ApiPropertyOptional({ enum: SPRINT_STATUSES })
  @IsOptional()
  @IsIn(SPRINT_STATUSES as unknown as string[])
  status?: SprintStatus;
}

export class MoveSprintTaskDto {
  @ApiProperty({ format: 'uuid', description: 'Target sprint (must belong to the SAME project — 409 SPRINT_PROJECT_MISMATCH otherwise)' })
  @IsUUID('4')
  sprintId!: string;
}

/** Real board column: derived from actual task rows — no hardcoded counts (spec 22). */
export class SprintBoardColumnDto {
  @ApiProperty({ enum: ['todo', 'doing', 'review', 'done'] })
  status!: string;

  @ApiProperty({ type: Number, description: 'Real count of tasks currently in this column' })
  count!: number;

  @ApiProperty({ type: 'array', description: 'Task rows in this column (paginated subset when page params supplied)' })
  tasks!: unknown[];
}

export class SprintBoardResponseDto {
  @ApiProperty({ type: 'object', additionalProperties: true, description: 'Sprint summary (id, code, name, status, projectId, startDate, endDate)' })
  sprint!: Record<string, unknown>;

  @ApiProperty({ type: SprintBoardColumnDto, isArray: true })
  columns!: SprintBoardColumnDto[];

  @ApiProperty({ type: Number, description: 'Total non-deleted tasks in the sprint' })
  total!: number;
}

/** Story-point aggregation from the DB (spec 30) — never hardcoded. */
export class SprintCompletionSummaryDto {
  @ApiProperty({ type: Number })
  total!: number;

  @ApiProperty({ type: Number })
  done!: number;

  @ApiProperty({ type: Number })
  open!: number;

  @ApiProperty({ type: Number, nullable: true, description: 'SUM(storyPoints) over all sprint tasks; NULL when no task declares points' })
  committedStoryPoints!: number | null;

  @ApiProperty({ type: Number, nullable: true, description: 'SUM(storyPoints) over done sprint tasks; NULL when none declare points' })
  completedStoryPoints!: number | null;
}
