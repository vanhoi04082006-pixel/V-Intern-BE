import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto';
export class TemplateTaskDto {
  @IsString() @Length(1, 256) title!: string;
  @IsString() @Length(10, 4000) requirements!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(256, { each: true }) dod!: string[];
  @IsIn(['frontend','backend','qa','business_analyst','devops']) role!: string;
  @IsInt() @Min(1) @Max(100) storyPoints!: number;
}
export class TemplateSprintDto {
  @IsString() @Length(1, 256) name!: string;
  @IsString() @Length(1, 512) goal!: string;
  @IsInt() @Min(1) @Max(90) durationDays!: number;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => TemplateTaskDto) tasks!: TemplateTaskDto[];
}
export class TemplateObjectivesDto {
  @IsOptional() @IsString() @MaxLength(2000) business?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(512, { each: true }) learning?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(512, { each: true }) product?: string[];
}
export class TemplateRoleDto {
  @IsString() @Length(1, 64) code!: string;
  @IsOptional() @IsString() @MaxLength(128) title?: string;
  @IsOptional() @IsInt() @Min(0) @Max(50) countMin?: number;
  @IsOptional() @IsInt() @Min(1) @Max(50) countMax?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(128, { each: true }) requiredSkills?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(128, { each: true }) recommendedSkills?: string[];
  @IsOptional() @IsIn(['junior', 'middle', 'senior', 'any']) level?: string;
}
export class TemplateOutputsDto {
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(512, { each: true }) deliverables?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(512, { each: true }) artifacts?: string[];
}
export class TemplateAcceptanceDto {
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(512, { each: true }) definitionOfDone?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(512, { each: true }) qualityGates?: string[];
}
export class CreateTemplateDto {
  @IsString() @Length(2, 256) name!: string;
  @IsString() @Length(10, 4000) description!: string;
  @IsIn(['beginner','intermediate','advanced']) difficulty!: 'beginner' | 'intermediate' | 'advanced';
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ArrayUnique() @IsString({ each: true }) @MaxLength(64, { each: true }) techStack!: string[];
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(5) @ArrayUnique() @IsIn(['frontend','backend','qa','business_analyst','devops'], { each: true }) roles!: string[];
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(256, { each: true }) modules!: string[];
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(18) @ValidateNested({ each: true }) @Type(() => TemplateSprintDto) sprints!: TemplateSprintDto[];
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(256, { each: true }) dod!: string[];
  @IsIn(['task-review-v1']) rubricVersion!: string;
  @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(2000, { each: true }) scenarios!: string[];
  @IsString() @Length(10, 12000) documentation!: string;
  // ── M2 richer blueprint (all optional: historic definitions keep working) ──
  @IsOptional() @IsString() @MaxLength(64) code?: string;
  @IsOptional() @IsString() @MaxLength(64) category?: string;
  @IsOptional() @ValidateNested() @Type(() => TemplateObjectivesDto) objectives?: TemplateObjectivesDto;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(512, { each: true }) scopeIn?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(512, { each: true }) scopeOut?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(40) @IsString({ each: true }) @MaxLength(1000, { each: true }) functionalRequirements?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(1000, { each: true }) nonFunctionalRequirements?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(5) @ValidateNested({ each: true }) @Type(() => TemplateRoleDto) roleDetails?: TemplateRoleDto[];
  @IsOptional() @ValidateNested() @Type(() => TemplateOutputsDto) expectedOutputs?: TemplateOutputsDto;
  @IsOptional() @ValidateNested() @Type(() => TemplateAcceptanceDto) acceptance?: TemplateAcceptanceDto;
}
export class StartTemplateDto {
  @IsString() @Length(2, 256) name!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsOptional() @IsUUID() requestId?: string;
}
export class QueryTemplatesDto extends PaginationQueryDto {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsString() @MaxLength(64) category?: string;
  @IsOptional() @IsIn(['beginner', 'intermediate', 'advanced']) difficulty?: string;
  @IsOptional() @IsIn(['active', 'archived']) status?: string;
  @IsOptional() @IsIn(['createdAt', 'name', 'code']) sort?: string;
}
export class UpdateTemplateDto {
  @IsOptional() @IsString() @Length(2, 256) name?: string;
  @IsOptional() @IsString() @MaxLength(64) category?: string;
  @IsOptional() @IsIn(['beginner', 'intermediate', 'advanced']) difficulty?: string;
  @IsOptional() @IsIn(['active', 'archived']) status?: string;
  @IsOptional() @ValidateNested() @Type(() => CreateTemplateDto) definition?: CreateTemplateDto;
}
export class ChangeRequestDto {
  @IsString() @Length(2, 256) title!: string;
  @IsString() @Length(10, 4000) description!: string;
  @IsString() @Length(10, 4000) reason!: string;
  @IsOptional() @IsDateString() dueDate?: string;
}
