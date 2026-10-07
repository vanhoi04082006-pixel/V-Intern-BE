import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Length } from 'class-validator';
import { RECRUITMENT_ROLE_CODES } from '../recruitment-roles';
import { INTERVIEW_ANSWER_MAX_LENGTH, INTERVIEW_ANSWER_MIN_LENGTH } from '../recruitment.constants';

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
