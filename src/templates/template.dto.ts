import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { SmallProjectPackage, TemplateAssessment } from './template-package';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto';
export class TemplateTaskDto {
  @IsOptional() @IsString() @Length(1, 64) key?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ArrayUnique() @IsString({ each: true }) @MaxLength(64, { each: true }) dependsOn?: string[];
  @IsOptional() @IsIn(['low', 'medium', 'high', 'urgent']) priority?: string;
  @IsOptional() @IsIn(['easy', 'medium', 'hard']) complexity?: string;
  @IsOptional() @IsInt() @Min(1) @Max(160) estimatedHours?: number;
  @IsOptional() @IsInt() @Min(1) @Max(540) recommendedOrder?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(64, { each: true }) skillTags?: string[];
  @IsOptional() @IsString() @MaxLength(1000) expectedOutput?: string;
  @IsString() @Length(1, 256) title!: string;
  @IsString() @Length(10, 4000) requirements!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(256, { each: true }) dod!: string[];
  @IsString() @Matches(/^[a-z][a-z0-9_]{1,31}$/) role!: string;
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
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(512, { each: true }) responsibilities?: string[];
}
export class TemplateArchitectureDto {
  @IsString() @Length(10, 2000) overview!: string;
  @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(512, { each: true }) entities!: string[];
  @IsArray() @ArrayMaxSize(40) @IsString({ each: true }) @MaxLength(512, { each: true }) apiSuggestions!: string[];
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(512, { each: true }) frontendPages!: string[];
}
export class TemplateMilestoneDto {
  @IsString() @Length(1, 128) title!: string;
  @IsInt() @Min(1) @Max(1620) day!: number;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(60) @ArrayUnique() @IsString({ each: true }) @MaxLength(64, { each: true }) taskKeys!: string[];
  @IsString() @Length(10, 1000) acceptance!: string;
}
export class TemplateOutputsDto {
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(512, { each: true }) deliverables?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(512, { each: true }) artifacts?: string[];
}
export class TemplateAcceptanceDto {
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(512, { each: true }) definitionOfDone?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(512, { each: true }) qualityGates?: string[];
}
export class TemplateDefinitionDto {
  @ApiPropertyOptional({ type: 'object', additionalProperties: true, description: 'Public small-project package v1: prerequisites/setup/run/starterFiles/sampleData. Strict domain schema; see SPEC-small-project-library.md.' })
  @IsOptional() @IsObject() learningPackage?: SmallProjectPackage;
  @IsOptional() @IsString() @Length(2, 128) slug?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1620) estimatedDurationDays?: number;
  @IsOptional() @IsInt() @Min(1) @Max(50) recommendedTeamSize?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(1000, { each: true }) businessRules?: string[];
  @IsOptional() @ValidateNested() @Type(() => TemplateArchitectureDto) architecture?: TemplateArchitectureDto;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => TemplateMilestoneDto) milestones?: TemplateMilestoneDto[];
  @IsOptional() @IsString() @Length(10, 2000) expectedOutcome?: string;
  @IsString() @Length(2, 256) name!: string;
  @IsString() @Length(10, 4000) description!: string;
  @IsIn(['beginner','intermediate','advanced']) difficulty!: 'beginner' | 'intermediate' | 'advanced';
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ArrayUnique() @IsString({ each: true }) @MaxLength(64, { each: true }) techStack!: string[];
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(6) @ArrayUnique() @IsString({ each: true }) @Matches(/^[a-z][a-z0-9_]{1,31}$/, { each: true }) roles!: string[];
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
  @IsOptional() @IsArray() @ArrayMaxSize(6) @ValidateNested({ each: true }) @Type(() => TemplateRoleDto) roleDetails?: TemplateRoleDto[];
  @IsOptional() @ValidateNested() @Type(() => TemplateOutputsDto) expectedOutputs?: TemplateOutputsDto;
  @IsOptional() @ValidateNested() @Type(() => TemplateAcceptanceDto) acceptance?: TemplateAcceptanceDto;
}
export class CreateTemplateDto extends TemplateDefinitionDto {
  @ApiPropertyOptional({ type: 'object', nullable: true, additionalProperties: true, writeOnly: true, description: 'Staff-only assessment v1. Persisted separately, never in public definition or run snapshot.' })
  @IsOptional() @IsObject() assessment?: TemplateAssessment | null;
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
  @ApiPropertyOptional({ type: 'object', nullable: true, additionalProperties: true, writeOnly: true, description: 'Omit to preserve, set null to remove only in the new version. Requires templates.assessment.manage.' })
  @IsOptional() @IsObject() assessment?: TemplateAssessment | null;
  @IsOptional() @IsInt() @Min(1) expectedVersion?: number;
  @IsOptional() @IsString() @Length(2, 256) name?: string;
  @IsOptional() @IsString() @MaxLength(64) category?: string;
  @IsOptional() @IsIn(['beginner', 'intermediate', 'advanced']) difficulty?: string;
  @IsOptional() @IsIn(['active', 'archived']) status?: string;
  @IsOptional() @ValidateNested() @Type(() => TemplateDefinitionDto) definition?: TemplateDefinitionDto;
}
export class ChangeRequestDto {
  @IsString() @Length(2, 256) title!: string;
  @IsString() @Length(10, 4000) description!: string;
  @IsString() @Length(10, 4000) reason!: string;
  @IsOptional() @IsDateString() dueDate?: string;
}
