import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsUUID, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

/**
 * AI Mentor DTOs (Phase 6, spec 11/13). Bounds mirror the service contract:
 * user messages 1..8000 chars (config may only narrow the service bound),
 * optional title ≤ 256, status filter active|archived.
 */
export class AiMentorPaginationQueryDto {
  @ApiProperty({ minimum: 1, default: 1, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page: number = 1;

  @ApiProperty({ minimum: 1, maximum: 50, default: 20, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  pageSize: number = 20;
}

export class ListConversationsQueryDto extends AiMentorPaginationQueryDto {
  @ApiPropertyOptional({ enum: ['active', 'archived'], required: false })
  @IsOptional()
  @IsIn(['active', 'archived'])
  status?: 'active' | 'archived';
}

export class CreateAiMentorConversationDto {
  @ApiPropertyOptional({ maxLength: 256, description: 'Optional conversation title' })
  @IsOptional()
  @IsString()
  @Length(1, 256)
  title?: string;
}

export class SendAiMentorMessageDto {
  @IsOptional() @IsUUID() taskId?: string;
  @ApiProperty({ minLength: 1, maxLength: 8000, description: 'The intern question (plain text)' })
  @IsString()
  @Length(1, 8000)
  content!: string;
}
