import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, Length } from 'class-validator';

export class IssueCertificateDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;
}

export class RevokeCertificateDto {
  @ApiProperty({ description: 'Required revocation reason (spec 50)', maxLength: 512 })
  @IsString()
  @IsNotEmpty()
  @Length(1, 512)
  reason!: string;
}
