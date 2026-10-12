import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { RECRUITMENT_ROLE_CODES } from '../recruitment-roles';
import { RECRUITMENT_PROFILE_STATUSES } from '../recruitment-status.machine';
import { INTERVIEW_ANSWER_MAX_LENGTH, INTERVIEW_ANSWER_MIN_LENGTH } from '../recruitment.constants';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';

/**
 * Phase 4 DTOs — identity ALWAYS comes from the authenticated principal;
 * no DTO ever accepts a userId as authority (spec 43).
 */
export class SelectRoleDto {
  @ApiProperty({ enum: RECRUITMENT_ROLE_CODES, example: 'frontend' })
  @IsString()
  @IsIn(RECRUITMENT_ROLE_CODES as unknown as string[], {
    message: `role must be one of: ${RECRUITMENT_ROLE_CODES.join(', ')}`,
  })
  role!: string;
}

export class SaveAnswerDto {
  @ApiProperty({ minLength: INTERVIEW_ANSWER_MIN_LENGTH, maxLength: INTERVIEW_ANSWER_MAX_LENGTH })
  @IsString()
  @Length(INTERVIEW_ANSWER_MIN_LENGTH, INTERVIEW_ANSWER_MAX_LENGTH, {
    message: `answerText must be between ${INTERVIEW_ANSWER_MIN_LENGTH} and ${INTERVIEW_ANSWER_MAX_LENGTH} characters`,
  })
  answerText!: string;
}

/**
 * M4 server-side candidate search (WP-4, ADR-12): search/role/eligibility/
 * status filters with stable sort and pagination. All optional and backward
 * compatible — plain page/pageSize behaves exactly as before.
 */
export class QueryCandidatesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ maxLength: 100, description: 'Match display name or email' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ description: 'Interview role code filter' })
  @IsOptional()
  @IsString()
  @IsIn(RECRUITMENT_ROLE_CODES as unknown as string[])
  role?: string;

  @ApiPropertyOptional({ enum: ['available', 'all'], default: 'all', description: 'available = passed with no active assignment' })
  @IsOptional()
  @IsString()
  @IsIn(['available', 'all'])
  eligibility?: string;

  @ApiPropertyOptional({ description: 'Recruitment profile status filter' })
  @IsOptional()
  @IsString()
  @IsIn(RECRUITMENT_PROFILE_STATUSES as unknown as string[])
  status?: string;

  @ApiPropertyOptional({ enum: ['updatedAt', 'name', 'overallScore'], default: 'updatedAt' })
  @IsOptional()
  @IsString()
  @IsIn(['updatedAt', 'name', 'overallScore'])
  sort?: string;
}
