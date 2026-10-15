import { Transform } from 'class-transformer';
import { Equals, IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';
const trimmed = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
export class RegisterDto {
  @Transform(trimmed) @IsString() @MinLength(2) @MaxLength(128)
  fullName!: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(320)
  email!: string;

  @IsString() @MinLength(8) @MaxLength(72) @Matches(/\S/, { message: 'Password cannot contain only whitespace.' })
  password!: string;

  @Equals(true)
  acceptedTerms!: boolean;
}
