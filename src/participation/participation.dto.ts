import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
export class ParticipationPolicyDto {
  @IsInt() @Min(0) expectedVersion!: number;
  @IsInt() @Min(1) @Max(50) warningFrom = 1;
  @IsInt() @Min(1) @Max(50) penaltyFrom = 2;
  @IsInt() @Min(1) @Max(50) replacementFrom = 3;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  penaltyPoints: number | null = null;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) penaltyCap = 20;
  @IsString() @MinLength(10) @MaxLength(1000) reason!: string;
}
export class ParticipationResolveDto {
  @IsIn(["excused", "reversed"]) action!: "excused" | "reversed";
  @IsInt() @Min(1) expectedDeadlineVersion!: number;
  @IsString() @MinLength(10) @MaxLength(1000) reason!: string;
}
export class ParticipationExtensionDto {
  @IsInt() @Min(0) expectedVersion!: number;
  @IsISO8601() until!: string;
  @IsString() @MinLength(10) @MaxLength(1000) reason!: string;
}
