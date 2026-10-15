import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto';
import { RECRUITMENT_ROLE_CODES } from './recruitment-roles';
export class QuestionBankQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(RECRUITMENT_ROLE_CODES) roleCode?: string;
  @IsOptional() @IsIn(['technical', 'introduction', 'english', 'communication']) phase?: string;
  @IsOptional() @IsIn(['easy', 'medium', 'hard']) difficulty?: string;
  @IsOptional() @IsIn(['active', 'retired']) status?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
}
export class QuestionContentDto {
  @IsIn(RECRUITMENT_ROLE_CODES) roleCode!: string;
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
