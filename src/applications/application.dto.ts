import {
  Equals,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
export class CreateRoundDto {
  @IsString() @Length(3, 160) name!: string;
  @IsDateString() opensAt!: string;
  @IsDateString() closesAt!: string;
}
export class ResendCredentialsDto {
  @IsBoolean() acknowledgeUncertain = false;
}
export class RoundStatusDto {
  @IsIn(["draft", "open", "closed"]) status!: "draft" | "open" | "closed";
}
export class CreateSlotDto {
  @IsString() @Length(1, 32) roleCode!: string;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @IsString() @Length(1, 64) timezone!: string;
  @IsInt() @Min(1) @Max(100) capacity!: number;
  @IsInt() @Min(30) @Max(10080) minimumPreparationMinutes = 60;
  @IsInt() @Min(5) @Max(10080) credentialsLeadMinutes = 30;
}
export class ApplyDto {
  @IsUUID() roundId!: string;
  @IsEmail() @Length(3, 320) email!: string;
  @IsString() @Length(2, 128) fullName!: string;
  @Equals("cv-consent-v1") consentVersion!: string;
}
export class AccessRequestDto {
  @IsUUID() roundId!: string;
  @IsEmail() @Length(3, 320) email!: string;
}
export class VerifyApplicationDto {
  @IsString() @Length(40, 128) token!: string;
}
export class ApplicationPageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10000) page = 1;
}
export class RescheduleDto {
  @IsUUID() slotId!: string;
}
export class RetakeBookingDto extends RescheduleDto {
  @IsString() @Length(10, 1000) reason!: string;
}
