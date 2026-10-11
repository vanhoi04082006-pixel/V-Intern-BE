import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min, ValidateNested } from 'class-validator';
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
}
export class StartTemplateDto {
  @IsString() @Length(2, 256) name!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
}
export class ChangeRequestDto {
  @IsString() @Length(2, 256) title!: string;
  @IsString() @Length(10, 4000) description!: string;
  @IsString() @Length(10, 4000) reason!: string;
  @IsOptional() @IsDateString() dueDate?: string;
}
