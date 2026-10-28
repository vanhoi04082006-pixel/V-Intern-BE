import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Matches, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto';
export class QuestionBankQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() @Matches(/^[a-z][a-z0-9_]{1,31}$/) roleCode?: string;
  @IsOptional() @IsIn(['technical', 'introduction', 'english', 'communication']) phase?: string;
  @IsOptional() @IsIn(['easy', 'medium', 'hard']) difficulty?: string;
  @IsOptional() @IsIn(['active', 'retired']) status?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
}
export class QuestionContentDto {
  @IsString() @Matches(/^[a-z][a-z0-9_]{1,31}$/) roleCode!: string;
  @IsIn(['technical', 'introduction', 'english', 'communication']) phase!: string;
  @IsIn(['easy', 'medium', 'hard']) difficulty!: string;
  @IsIn(['vi', 'en']) language!: string;
  @IsString() @Length(10, 4000) prompt!: string;
  @IsArray() @ArrayMaxSize(20) @ArrayUnique() @IsString({ each: true }) @Length(1, 128, { each: true }) expectedConcepts!: string[];
  @IsString() @Length(10, 4000) exampleAnswer!: string;
  @IsString() @Length(10, 4000) scoringRubric!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(8) @IsString({ each: true }) @Length(5, 512, { each: true }) followUpHints!: string[];
  @IsArray() @ArrayMaxSize(20) @ArrayUnique() @IsString({ each: true }) @Length(1, 128, { each: true }) tags!: string[];
  @IsBoolean() isActive!: boolean;
}
export class UpdateQuestionDto extends QuestionContentDto {
  @IsInt() @Min(1) version!: number;
}
