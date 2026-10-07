import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { ASSIGNMENT_STATUSES } from '../entities/assignment.entity';

export class CreateAssignmentDto {
  @ApiProperty({ format: 'uuid', description: 'Intern user id (must be active)' })
  @IsUUID('4')
  internId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  projectId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  sessionId!: string;
}

export class QueryAssignmentsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  internId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  sessionId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  projectId?: string;

  @ApiPropertyOptional({ enum: ASSIGNMENT_STATUSES })
  @IsOptional()
  @IsIn(ASSIGNMENT_STATUSES as unknown as string[])
  status?: (typeof ASSIGNMENT_STATUSES)[number];
}

/** Reserved for future search surfaces — kept validated (no raw passthrough). */
export class AssignmentNoteDto {
  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
