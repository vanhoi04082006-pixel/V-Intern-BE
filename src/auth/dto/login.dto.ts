import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ format: 'email', maxLength: 320 })
  @IsEmail({}, { message: 'Email is not valid.' })
  email!: string;

  @ApiProperty({ minLength: 1, maxLength: 72 })
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password!: string;
}
