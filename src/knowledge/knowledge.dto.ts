import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsDefined, IsIn, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { KNOWLEDGE_AUDIENCES, KNOWLEDGE_KINDS, KNOWLEDGE_PURPOSES, KNOWLEDGE_STATUSES, KnowledgeAudience, KnowledgeDraft, KnowledgeKind, KnowledgePurpose, KnowledgeStatus } from './knowledge.contracts';
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
class KnowledgeSourceDto {
  @ApiProperty({ maxLength: 200, example: 'Git documentation' })
  @IsString() @MaxLength(200) title!: string;
  @ApiPropertyOptional({ maxLength: 2000, example: 'https://git-scm.com/docs' })
  @IsOptional() @IsString() @MaxLength(2000) url?: string;
  @ApiPropertyOptional({ maxLength: 1000, description: 'Tham chiếu tài liệu khi không có URL' })
  @IsOptional() @IsString() @MaxLength(1000) reference?: string;
}
export class KnowledgeDraftDto implements KnowledgeDraft {
  @ApiProperty({ enum: KNOWLEDGE_KINDS })
  @IsIn(KNOWLEDGE_KINDS) kind!: KnowledgeKind;
  @ApiProperty({ maxLength: 200, example: 'Đọc lỗi Git trước khi sửa' })
  @IsString() @MaxLength(200) title!: string;
  @ApiProperty({ maxLength: 1000, description: 'Publish cần ít nhất 20 ký tự' })
  @IsString() @MaxLength(1000) summary!: string;
  @ApiProperty({ enum: ['vi', 'en'] })
  @IsIn(['vi', 'en']) language!: 'vi' | 'en';
  @ApiProperty({ enum: ['easy', 'medium', 'hard'], nullable: true })
  @ValidateIf((_object, value) => value !== null) @IsIn(['easy', 'medium', 'hard']) difficulty!: 'easy' | 'medium' | 'hard' | null;
  @ApiProperty({ enum: KNOWLEDGE_AUDIENCES, description: 'qa/solution/rubric bắt buộc grading_only' })
  @IsIn(KNOWLEDGE_AUDIENCES) audience!: KnowledgeAudience;
  @ApiProperty({ type: [String], enum: KNOWLEDGE_PURPOSES, minItems: 1, maxItems: 9 })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(9) @ArrayUnique() @IsIn(KNOWLEDGE_PURPOSES, { each: true }) purposes!: KnowledgePurpose[];
  @ApiProperty({ type: [String], maxItems: 30, description: 'Mã nghề từ catalog M01; rỗng nghĩa là dùng chung' })
  @IsArray() @ArrayMaxSize(30) @ArrayUnique() @IsString({ each: true }) @Matches(/^[a-z][a-z0-9_]{1,31}$/, { each: true }) roleCodes!: string[];
  @ApiProperty({ type: [String], maxItems: 30 })
  @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(80, { each: true }) tags!: string[];
  @ApiProperty({ type: [KnowledgeSourceDto], maxItems: 20 })
  @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => KnowledgeSourceDto) sources!: KnowledgeSourceDto[];
  @ApiProperty({ type: 'object', additionalProperties: true, description: 'Draft JSON; khi publish kiểm schema theo kind. Xem docs/KNOWLEDGE-LIBRARY.md.', example: { markdown: 'Nội dung hướng dẫn có nguồn và được biên soạn đầy đủ.' } })
  @IsObject() body!: KnowledgeDraft['body'];
}
export class CreateKnowledgeDto {
  @ApiProperty({ pattern: '^[a-z][a-z0-9_-]{1,79}$', example: 'git-read-errors' })
  @Transform(trim) @IsString() @Matches(/^[a-z][a-z0-9_-]{1,79}$/) code!: string;
  @ApiProperty({ type: KnowledgeDraftDto })
  @IsDefined() @ValidateNested() @Type(() => KnowledgeDraftDto) draft!: KnowledgeDraftDto;
}
export class KnowledgeVersionDto {
  @ApiProperty({ minimum: 1, maximum: 2147483646, description: 'Version current mà người dùng đã đọc' })
  @IsInt() @Min(1) @Max(2147483646) version!: number;
}
export class UpdateKnowledgeDto extends KnowledgeVersionDto {
  @ApiProperty({ type: KnowledgeDraftDto })
  @IsDefined() @ValidateNested() @Type(() => KnowledgeDraftDto) draft!: KnowledgeDraftDto;
}
export class RestoreKnowledgeDto extends KnowledgeVersionDto {
  @ApiProperty({ minimum: 1, maximum: 2147483646, description: 'Bản lịch sử được chép thành draft mới' })
  @IsInt() @Min(1) @Max(2147483646) sourceVersion!: number;
}
export class KnowledgePageDto {
  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 100000 })
  @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize = 20;
}
export class KnowledgeQueryDto extends KnowledgePageDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) search?: string;
  @ApiPropertyOptional({ enum: KNOWLEDGE_STATUSES })
  @IsOptional() @IsIn(KNOWLEDGE_STATUSES) status?: KnowledgeStatus;
  @ApiPropertyOptional({ enum: KNOWLEDGE_KINDS })
  @IsOptional() @IsIn(KNOWLEDGE_KINDS) kind?: KnowledgeKind;
  @ApiPropertyOptional({ enum: KNOWLEDGE_AUDIENCES })
  @IsOptional() @IsIn(KNOWLEDGE_AUDIENCES) audience?: KnowledgeAudience;
  @ApiPropertyOptional({ enum: KNOWLEDGE_PURPOSES })
  @IsOptional() @IsIn(KNOWLEDGE_PURPOSES) purpose?: KnowledgePurpose;
  @ApiPropertyOptional({ pattern: '^[a-z][a-z0-9_]{1,31}$' })
  @IsOptional() @Matches(/^[a-z][a-z0-9_]{1,31}$/) roleCode?: string;
}
export class KnowledgeImportDryRunDto {
  @ApiProperty({ type: 'array', minItems: 1, maxItems: 50, items: { type: 'object', additionalProperties: true }, description: 'Hàng {code,draft}; mỗi hàng được kiểm riêng, không mutation' })
  // Rows are validated separately so one bad row does not hide the others.
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) entries!: unknown[];
}
