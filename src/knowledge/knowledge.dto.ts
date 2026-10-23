import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsDefined, IsIn, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { KNOWLEDGE_AUDIENCES, KNOWLEDGE_KINDS, KNOWLEDGE_PURPOSES, KNOWLEDGE_STATUSES, KnowledgeAudience, KnowledgeDraft, KnowledgeKind, KnowledgePurpose, KnowledgeStatus } from './knowledge.contracts';
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
class KnowledgeSourceDto {
  @IsString() @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) url?: string;
  @IsOptional() @IsString() @MaxLength(1000) reference?: string;
}
export class KnowledgeDraftDto implements KnowledgeDraft {
  @IsIn(KNOWLEDGE_KINDS) kind!: KnowledgeKind;
  @IsString() @MaxLength(200) title!: string;
  @IsString() @MaxLength(1000) summary!: string;
  @IsIn(['vi', 'en']) language!: 'vi' | 'en';
  @ValidateIf((_object, value) => value !== null) @IsIn(['easy', 'medium', 'hard']) difficulty!: 'easy' | 'medium' | 'hard' | null;
  @IsIn(KNOWLEDGE_AUDIENCES) audience!: KnowledgeAudience;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(9) @ArrayUnique() @IsIn(KNOWLEDGE_PURPOSES, { each: true }) purposes!: KnowledgePurpose[];
  @IsArray() @ArrayMaxSize(30) @ArrayUnique() @IsString({ each: true }) @Matches(/^[a-z][a-z0-9_]{1,31}$/, { each: true }) roleCodes!: string[];
  @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(80, { each: true }) tags!: string[];
  @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => KnowledgeSourceDto) sources!: KnowledgeSourceDto[];
  @IsObject() body!: KnowledgeDraft['body'];
}
export class CreateKnowledgeDto {
  @Transform(trim) @IsString() @Matches(/^[a-z][a-z0-9_-]{1,79}$/) code!: string;
  @IsDefined() @ValidateNested() @Type(() => KnowledgeDraftDto) draft!: KnowledgeDraftDto;
}
export class KnowledgeVersionDto {
  @IsInt() @Min(1) @Max(2147483646) version!: number;
}
export class UpdateKnowledgeDto extends KnowledgeVersionDto {
  @IsDefined() @ValidateNested() @Type(() => KnowledgeDraftDto) draft!: KnowledgeDraftDto;
}
export class RestoreKnowledgeDto extends KnowledgeVersionDto {
  @IsInt() @Min(1) @Max(2147483646) sourceVersion!: number;
}
export class KnowledgePageDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize = 20;
}
export class KnowledgeQueryDto extends KnowledgePageDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) search?: string;
  @IsOptional() @IsIn(KNOWLEDGE_STATUSES) status?: KnowledgeStatus;
  @IsOptional() @IsIn(KNOWLEDGE_KINDS) kind?: KnowledgeKind;
  @IsOptional() @IsIn(KNOWLEDGE_AUDIENCES) audience?: KnowledgeAudience;
  @IsOptional() @IsIn(KNOWLEDGE_PURPOSES) purpose?: KnowledgePurpose;
  @IsOptional() @Matches(/^[a-z][a-z0-9_]{1,31}$/) roleCode?: string;
}
export class KnowledgeImportDryRunDto {
  // Rows are validated separately so one bad row does not hide the others.
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) entries!: unknown[];
}
