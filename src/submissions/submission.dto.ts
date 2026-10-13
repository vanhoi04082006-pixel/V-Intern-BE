import { Type } from 'class-transformer';
import { IsDefined, IsInt, IsNumber, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
export class SubmitTaskDto {
  @IsString() @MaxLength(512) prUrl!: string;
  @IsString() @MinLength(10) @MaxLength(4000) summary!: string;
  @IsInt() @Min(1) version!: number;
}
export class SubmissionRubricDto {
  @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(100) functional!: number;
  @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(100) quality!: number;
  @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(100) testing!: number;
  @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(100) errors!: number;
  @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(100) security!: number;
  @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(100) dod!: number;
}
export class ReviewSubmissionDto {
  @IsDefined() @ValidateNested() @Type(() => SubmissionRubricDto) rubric!: SubmissionRubricDto;
  @IsString() @MinLength(10) @MaxLength(4000) feedback!: string;
  @IsInt() @Min(1) taskVersion!: number;
}
