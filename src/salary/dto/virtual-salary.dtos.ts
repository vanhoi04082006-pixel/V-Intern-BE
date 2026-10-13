import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export const SALARY_ADJUSTMENT_TYPES = ['bonus', 'penalty', 'adjustment', 'reversal'] as const;

export class CreateSalaryAdjustmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ enum: SALARY_ADJUSTMENT_TYPES })
  @IsIn(SALARY_ADJUSTMENT_TYPES as unknown as string[])
  type!: string;

  @ApiPropertyOptional({
    description: 'Signed magnitude: bonus > 0 (stored positive), penalty > 0 (stored NEGATIVE), adjustment signed non-zero; ignored for reversal',
  })
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional({ description: 'Source ledger row id — REQUIRED for reversal' })
  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @ApiProperty({ description: 'Required audit reason (spec 37)', maxLength: 512 })
  @IsString()
  @IsNotEmpty()
  @Length(1, 512)
  reason!: string;

  @ApiPropertyOptional({
    description: 'Client-generated idempotency key (UUID). Replays with the same key return the original row instead of minting duplicates.',
  })
  @IsOptional()
  @IsUUID()
  requestId?: string;
}
