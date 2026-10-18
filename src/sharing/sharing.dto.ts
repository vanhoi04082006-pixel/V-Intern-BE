import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Length,
  Max,
  Min,
} from "class-validator";
export class RequestAccessDto {
  @IsEmail() ownerEmail!: string;
  @Length(10, 2000) reason!: string;
}
export class DecideAccessDto {
  @IsIn(["approve", "deny", "revoke"]) decision!: "approve" | "deny" | "revoke";
  @IsOptional() @IsUUID() sessionId?: string;
  @IsOptional() @IsInt() @Min(1) @Max(30) days?: number;
}
