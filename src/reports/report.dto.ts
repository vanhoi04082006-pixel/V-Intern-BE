import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
export const REPORT_KINDS = ['progress','performance','evaluation','review','risk'] as const;
export type ReportKind = typeof REPORT_KINDS[number];
export class CreateReportDto {
  @IsUUID() requestId!: string;
  @IsString() @MaxLength(256) title!: string;
  @IsIn(REPORT_KINDS) kind!: ReportKind;
  @IsUUID() projectId!: string;
  @IsOptional() @IsUUID() sessionId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}
export class ReportQueryDto {
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() sessionId?: string;
  @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(100000) page=1;
  @IsOptional() @IsIn(REPORT_KINDS) kind?: ReportKind;
}
