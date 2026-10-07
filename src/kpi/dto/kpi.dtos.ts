import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsDateString, IsIn, IsString, Length } from 'class-validator';
import { KPI_PERIOD_STATUSES } from '../kpi-status.machine';

export class CreateKpiPeriodDto {
  @ApiProperty({ maxLength: 64, example: 'KPI-2026-Q1' })
  @IsString()
  @Length(1, 64)
  code!: string;

  @ApiProperty({ maxLength: 256 })
  @IsString()
  @Length(1, 256)
  name!: string;

  @ApiProperty({ format: 'date-time', description: 'Inclusive start (UTC)' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ format: 'date-time', description: 'Exclusive end (UTC)' })
  @IsDateString()
  endDate!: string;
}

export class UpdateKpiPeriodDto extends PartialType(CreateKpiPeriodDto) {}

export class TransitionKpiPeriodDto {
  @ApiProperty({ enum: KPI_PERIOD_STATUSES })
  @IsIn(KPI_PERIOD_STATUSES as unknown as string[])
  status!: string;
}
