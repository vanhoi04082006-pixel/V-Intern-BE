import { Transform } from "class-transformer";
import {
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
export class ReplacementPreviewDto {
  @IsUUID() adviceId!: string;
  @IsUUID() candidateId!: string;
  @IsInt() @Min(1) @Max(168) handoverHours = 24;
}
export class ReplacementApprovalDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) expectedPreviewHash!: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}
