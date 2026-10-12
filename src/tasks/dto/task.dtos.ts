import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsISO8601,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { TASK_PRIORITIES, TASK_STATUSES, TaskPriority, TaskStatus } from '../task-status.machine';

export class CreateTaskDto {
  @ApiProperty({ maxLength: 256 })
  @IsString()
  @IsNotEmpty()
  @Length(1, 256)
  title!: string;

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  projectId!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Sprint must belong to the same project (409 SPRINT_PROJECT_MISMATCH)' })
  @IsOptional()
  @IsUUID('4')
  sprintId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Assignee must hold an ACTIVE assignment on this project (409 INVALID_ASSIGNEE)',
  })
  @IsOptional()
  @IsUUID('4')
  assigneeId?: string;

  @ApiPropertyOptional({ enum: TASK_PRIORITIES, default: 'medium' })
  @IsOptional()
  @IsIn(TASK_PRIORITIES as unknown as string[])
  priority?: TaskPriority;

  @ApiPropertyOptional({ minimum: 0, maximum: 1000, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  storyPoints?: number;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsISO8601()
  dueDate?: string;
}

/**
 * Manage-side update (tasks.manage): metadata + sprint move + assignee
 * change + (optional) status transition in one controlled PATCH.
 * `status` is routed through the transition machine (409 on illegal moves);
 * rework (review→doing) is allowed ONLY here, never on /my.
 */
export class UpdateTaskDto {
  @ApiPropertyOptional({ minimum: 1, description: 'Version observed by the client; stale edits return 409 TASK_VERSION_CONFLICT' })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;

  @ApiPropertyOptional({ maxLength: 256 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(1, 256)
  title?: string;

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  sprintId?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'null = unassign' })
  @IsOptional()
  @IsUUID('4')
  assigneeId?: string | null;

  @ApiPropertyOptional({ enum: TASK_PRIORITIES })
  @IsOptional()
  @IsIn(TASK_PRIORITIES as unknown as string[])
  priority?: TaskPriority;

  @ApiPropertyOptional({ minimum: 0, maximum: 1000, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  storyPoints?: number;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @ApiPropertyOptional({ enum: TASK_STATUSES, description: 'Presence triggers a server-enforced transition' })
  @IsOptional()
  @IsIn(TASK_STATUSES as unknown as string[])
  status?: TaskStatus;

  @ApiPropertyOptional({ maxLength: 512, description: 'Transition reason (recorded in status history)' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;
}

/**
 * Intern own-task update (spec 9) — PATCH /tasks/:id/my.
 * ONLY status (intern-legal transitions) + progress. Never accepts
 * assignee/sprint/story points/creator changes (spec 8).
 */
export class UpdateMyTaskDto {
  @ApiPropertyOptional({ minimum: 1, description: 'Version observed by the client; stale edits return 409 TASK_VERSION_CONFLICT' })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;

  @ApiPropertyOptional({ enum: TASK_STATUSES, description: 'todo→doing, doing→review only (409 INVALID_TASK_TRANSITION otherwise)' })
  @IsOptional()
  @IsIn(TASK_STATUSES as unknown as string[])
  status?: TaskStatus;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  progress?: number;

  @ApiPropertyOptional({ maxLength: 512 })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;
}

export class CreateTaskCommentDto {
  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @IsNotEmpty()
  @Length(1, 2000)
  content!: string;
}

export class QueryTasksDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Case-insensitive LIKE over code+title' })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  search?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  projectId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  sprintId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Tasks of the sprints belonging to this session' })
  @IsOptional()
  @IsUUID('4')
  sessionId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  assigneeId?: string;

  @ApiPropertyOptional({ enum: TASK_STATUSES })
  @IsOptional()
  @IsIn(TASK_STATUSES as unknown as string[])
  status?: TaskStatus;

  @ApiPropertyOptional({ enum: TASK_PRIORITIES })
  @IsOptional()
  @IsIn(TASK_PRIORITIES as unknown as string[])
  priority?: TaskPriority;

  @ApiPropertyOptional({ format: 'date-time', description: 'dueDate >= dueFrom' })
  @IsOptional()
  @IsISO8601()
  dueFrom?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'dueDate <= dueTo' })
  @IsOptional()
  @IsISO8601()
  dueTo?: string;

  @ApiPropertyOptional({ default: false, description: 'true → scope to the authenticated principal (assignee = me)' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  mine?: boolean;

  @ApiPropertyOptional({ enum: ['createdAt', 'dueDate', 'priority'], default: 'createdAt' })
  @IsOptional()
  @IsIn(['createdAt', 'dueDate', 'priority'])
  sortBy?: 'createdAt' | 'dueDate' | 'priority';

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'DESC' })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}
